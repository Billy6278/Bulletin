'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const db = require('./models');
const excelParser = require('./services/excelParser');
const calculator = require('./services/calculator');
const reportGenerator = require('./services/reportGenerator');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'Générateur de Bulletins Scolaires',
    icon: path.join(__dirname, 'icon.png') // Optional placeholder
  });

  mainWindow.loadFile('index.html');
  
  // Open dev tools in development if needed
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(async () => {
  // Sync SQLite database
  try {
    await db.sequelize.sync();
    console.log('Database synced successfully.');
    
    // Seed default grading scale if it doesn't exist
    const [scale, created] = await db.Config.findOrCreate({
      where: { key: 'grading_scale' },
      defaults: {
        value: JSON.stringify([
          { min: 16, label: 'Très Bien' },
          { min: 14, label: 'Bien' },
          { min: 12, label: 'Assez Bien' },
          { min: 10, label: 'Passable' },
          { min: 0, label: 'Insuffisant' }
        ])
      }
    });
    
    // Seed default school metadata
    await db.Config.findOrCreate({
      where: { key: 'school_name' },
      defaults: { value: 'Collège & Lycée Djoma' }
    });
    
    await db.Config.findOrCreate({
      where: { key: 'school_year' },
      defaults: { value: 'Année Scolaire 2025-2026' }
    });
    
  } catch (err) {
    console.error('Error syncing database:', err);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ==================== IPC HANDLERS ====================

// 1. Select Excel File Dialog
ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Fichiers Excel', extensions: ['xlsx', 'xls'] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// 2. Import Excel file data
ipcMain.handle('import-excel', async (event, filePath) => {
  try {
    return await excelParser.importExcelFile(filePath);
  } catch (error) {
    console.error('Error during Excel import:', error);
    return {
      success: false,
      message: error.message || 'Une erreur est survenue lors de l\'importation.'
    };
  }
});

// 3. Get Levels (classes) and Periods
ipcMain.handle('get-levels-periods', async () => {
  try {
    // Get unique classes
    const classes = await db.Eleve.findAll({
      attributes: [[db.sequelize.fn('DISTINCT', db.sequelize.col('classe')), 'classe']],
      order: [['classe', 'ASC']]
    });
    
    // Get unique periods
    const periods = await db.Note.findAll({
      attributes: [[db.sequelize.fn('DISTINCT', db.sequelize.col('periode')), 'periode']],
      order: [['periode', 'ASC']]
    });
    
    return {
      levels: classes.map(c => c.classe),
      periods: periods.map(p => p.periode)
    };
  } catch (error) {
    console.error('Error getting levels and periods:', error);
    return { levels: [], periods: [] };
  }
});

// 4. Get class calculation results (list of students with average, rank, appreciation)
ipcMain.handle('get-class-results', async (event, level, period) => {
  try {
    return await calculator.calculateClassResults(level, period);
  } catch (error) {
    console.error('Error calculating class results:', error);
    return { resultsList: [], resultsMap: {}, totalStudents: 0 };
  }
});

// 5. Get student detailed grades for all periods
ipcMain.handle('get-student-details', async (event, studentId, level, period) => {
  try {
    const student = await db.Eleve.findByPk(studentId);
    if (!student) throw new Error('Élève introuvable');
    
    // Fetch all notes for this student
    const notes = await db.Note.findAll({
      where: { eleveId: studentId },
      include: [{ model: db.Matiere, as: 'matiere' }]
    });
    
    // Group notes by subject ID
    const notesMap = {};
    notes.forEach(n => {
      if (!notesMap[n.matiereId]) {
        notesMap[n.matiereId] = {
          matiereId: n.matiereId,
          matiereName: n.matiere ? n.matiere.nom : 'Inconnue',
          coefficient: n.matiere ? (n.matiere.coefficient || 1) : 1,
          grades: { '1er': null, '2ème': null }
        };
      }
      
      let pKey = n.periode;
      if (pKey === '2em') pKey = '2ème';
      notesMap[n.matiereId].grades[pKey] = n.note;
    });
    
    const gradesList = Object.values(notesMap);
    
    // Get class calculations to get current rank and average
    const classData = await calculator.calculateClassResults(level, period);
    const studentResult = classData.resultsMap[studentId] || {
      average: null,
      rank: null,
      appreciation: 'Non classé',
      totalPoints: 0,
      totalCoeff: 0
    };
    
    return {
      student,
      grades: gradesList,
      summary: studentResult
    };
  } catch (error) {
    console.error('Error getting student details:', error);
    return null;
  }
});

// 6. Update single grade
ipcMain.handle('update-grade', async (event, studentId, matiereId, period, noteValue) => {
  try {
    const value = noteValue === '' || noteValue === null || noteValue === undefined ? null : parseFloat(noteValue);
    
    const [noteInst, created] = await db.Note.findOrCreate({
      where: {
        eleveId: studentId,
        matiereId: matiereId,
        periode: period
      },
      defaults: { note: value }
    });
    
    if (!created) {
      noteInst.note = value;
      await noteInst.save();
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error updating grade:', error);
    return { success: false, message: error.message };
  }
});

// 7. Export Single Report Card to PDF
ipcMain.handle('export-report-card', async (event, studentId, level, period) => {
  try {
    const student = await db.Eleve.findByPk(studentId);
    if (!student) throw new Error('Élève introuvable');
    
    const sanitizedFileName = `Bulletin_${level.replace(/\s+/g, '_')}_${student.prenom}_${student.nom}.pdf`
      .replace(/[^a-zA-Z0-9_\-\.]/g, '');
    
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Exporter le Bulletin Scolaire (PDF)',
      defaultPath: path.join(app.getPath('downloads'), sanitizedFileName),
      filters: [
        { name: 'Document PDF', extensions: ['pdf'] }
      ]
    });
    
    if (result.canceled || !result.filePath) {
      return { success: false, message: 'Exportation annulée.' };
    }
    
    const pdfGenerator = require('./services/pdfGenerator');
    await pdfGenerator.generateStudentPDF(studentId, level, result.filePath);
    return { success: true, message: `Bulletin exporté avec succès à : ${result.filePath}` };
    
  } catch (error) {
    console.error('Error exporting report card PDF:', error);
    return { success: false, message: error.message || 'Une erreur est survenue lors de l\'exportation.' };
  }
});

// 8. Settings IPC
ipcMain.handle('get-settings', async () => {
  try {
    const nameCfg = await db.Config.findOne({ where: { key: 'school_name' } });
    const yearCfg = await db.Config.findOne({ where: { key: 'school_year' } });
    const logoCfg = await db.Config.findOne({ where: { key: 'school_logo' } });
    const scaleCfg = await db.Config.findOne({ where: { key: 'grading_scale' } });
    
    return {
      schoolName: nameCfg ? nameCfg.value : 'Collège & Lycée Djoma',
      schoolYear: yearCfg ? yearCfg.value : 'Année Scolaire 2025-2026',
      schoolLogo: logoCfg ? logoCfg.value : '',
      gradingScale: scaleCfg ? JSON.parse(scaleCfg.value) : []
    };
  } catch (error) {
    console.error('Error getting settings:', error);
    return null;
  }
});

ipcMain.handle('save-settings', async (event, settings) => {
  try {
    if (settings.schoolName !== undefined) {
      await db.Config.upsert({ key: 'school_name', value: settings.schoolName });
    }
    if (settings.schoolYear !== undefined) {
      await db.Config.upsert({ key: 'school_year', value: settings.schoolYear });
    }
    if (settings.schoolLogo !== undefined) {
      await db.Config.upsert({ key: 'school_logo', value: settings.schoolLogo });
    }
    if (settings.gradingScale !== undefined) {
      await db.Config.upsert({ key: 'grading_scale', value: JSON.stringify(settings.gradingScale) });
    }
    return { success: true };
  } catch (error) {
    console.error('Error saving settings:', error);
    return { success: false, message: error.message };
  }
});

// 9. Subject coefficients
ipcMain.handle('get-subjects', async () => {
  try {
    return await db.Matiere.findAll({ order: [['nom', 'ASC']] });
  } catch (error) {
    console.error('Error fetching subjects:', error);
    return [];
  }
});

ipcMain.handle('update-subject-coefficients', async (event, subjectCoeffs) => {
  try {
    await db.sequelize.transaction(async (t) => {
      for (const item of subjectCoeffs) {
        await db.Matiere.update(
          { coefficient: parseInt(item.coefficient) || 1 },
          { where: { id: item.id }, transaction: t }
        );
      }
    });
    return { success: true };
  } catch (error) {
    console.error('Error updating subject coefficients:', error);
    return { success: false, message: error.message };
  }
});

// 10. Add Student
ipcMain.handle('add-student', async (event, studentData) => {
  try {
    const { prenom, nom, classe, matricule } = studentData;
    let finalMatricule = matricule;
    if (!finalMatricule) {
      const count = await db.Eleve.count({ where: { classe } });
      finalMatricule = `MAT-${classe.replace(/\s+/g, '')}-${(count + 1).toString().padStart(3, '0')}`;
    }
    
    let student;
    await db.sequelize.transaction(async (t) => {
      student = await db.Eleve.create({
        prenom,
        nom,
        classe,
        matricule: finalMatricule
      }, { transaction: t });
      
      // Auto-create null notes for all subjects in all periods
      const matieres = await db.Matiere.findAll({ transaction: t });
      const periods = ['1er', '2ème'];
      for (const m of matieres) {
        for (const p of periods) {
          await db.Note.create({
            eleveId: student.id,
            matiereId: m.id,
            periode: p,
            note: null
          }, { transaction: t });
        }
      }
    });
    
    return { success: true, message: `Élève ${prenom} ${nom} ajouté avec succès.`, student };
  } catch (error) {
    console.error('Error adding student:', error);
    return { success: false, message: error.message || 'Erreur lors de la création de l\'élève.' };
  }
});

// 11. Add Subject
ipcMain.handle('add-subject', async (event, subjectData) => {
  try {
    const { nom, coefficient } = subjectData;
    
    let subject;
    await db.sequelize.transaction(async (t) => {
      subject = await db.Matiere.create({
        nom,
        coefficient: parseInt(coefficient) || 1
      }, { transaction: t });
      
      // Auto-create null notes for this subject for all students in all periods
      const students = await db.Eleve.findAll({ transaction: t });
      const periods = ['1er', '2ème'];
      for (const s of students) {
        for (const p of periods) {
          await db.Note.create({
            eleveId: s.id,
            matiereId: subject.id,
            periode: p,
            note: null
          }, { transaction: t });
        }
      }
    });
    
    return { success: true, message: `Matière ${nom} ajoutée avec succès.`, subject };
  } catch (error) {
    console.error('Error adding subject:', error);
    return { success: false, message: error.message || 'Erreur lors de la création de la matière.' };
  }
});

// 12. Export all class bulletins to a single PDF file
ipcMain.handle('export-class-bulletins', async (event, level, period) => {
  try {
    const sanitizedFileName = `Bulletins_Annuels_${level.replace(/\s+/g, '_')}.pdf`
      .replace(/[^a-zA-Z0-9_\-\.]/g, '');
    
    const result = await dialog.showSaveDialog(mainWindow, {
      title: `Exporter les Bulletins Annuels de la classe ${level}`,
      defaultPath: path.join(app.getPath('downloads'), sanitizedFileName),
      filters: [
        { name: 'Document PDF', extensions: ['pdf'] }
      ]
    });
    
    if (result.canceled || !result.filePath) {
      return { success: false, message: 'Exportation annulée.' };
    }
    
    const pdfGenerator = require('./services/pdfGenerator');
    await pdfGenerator.generateLevelPDF(level, result.filePath);
    
    return {
      success: true,
      message: `Bulletins de la classe ${level} exportés avec succès sous forme de fichier PDF unique !`
    };
    
  } catch (error) {
    console.error('Error exporting class bulletins PDF:', error);
    return { success: false, message: error.message || 'Une erreur est survenue lors de l\'exportation PDF.' };
  }
});

// 12.5. Export merit list for a class (PDF format)
ipcMain.handle('export-class-merit-list', async (event, level) => {
  try {
    const sanitizedLevel = level.replace(/[^a-zA-Z0-9]/g, '_');
    const sanitizedFileName = `Palmares_Merite_${sanitizedLevel}.pdf`;
    
    const result = await dialog.showSaveDialog(mainWindow, {
      title: `Exporter le Palmarès de Mérite - Classe ${level}`,
      defaultPath: path.join(app.getPath('downloads'), sanitizedFileName),
      filters: [
        { name: 'Document PDF', extensions: ['pdf'] }
      ]
    });
    
    if (result.canceled || !result.filePath) {
      return { success: false, message: 'Exportation annulée.' };
    }
    
    const pdfGenerator = require('./services/pdfGenerator');
    await pdfGenerator.generateMeritListPDF(level, result.filePath);
    
    return {
      success: true,
      message: `Palmarès de mérite de la classe ${level} exporté avec succès sous forme de fichier PDF !`
    };
    
  } catch (error) {
    console.error('Error exporting class merit list PDF:', error);
    return { success: false, message: error.message || 'Une erreur est survenue lors de l\'exportation du palmarès.' };
  }
});

// 13. Export all bulletins in the database (global PDF export: one PDF per class/level)
ipcMain.handle('export-all-bulletins', async (event) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Sélectionner le dossier d\'exportation pour tous les PDFs des classes',
      properties: ['openDirectory', 'createDirectory']
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: 'Exportation annulée.' };
    }
    
    const targetDir = result.filePaths[0];
    
    // Get unique classes
    const classesData = await db.Eleve.findAll({
      attributes: [[db.sequelize.fn('DISTINCT', db.sequelize.col('classe')), 'classe']],
      order: [['classe', 'ASC']]
    });
    
    const classes = classesData.map(c => c.classe);
    if (classes.length === 0) {
      return { success: false, message: 'Aucun élève trouvé. Veuillez d\'abord importer le fichier Excel.' };
    }
    
    const pdfGenerator = require('./services/pdfGenerator');
    let successCount = 0;
    
    for (let i = 0; i < classes.length; i++) {
      const level = classes[i];
      const fileName = `Bulletins_Annuels_${level.replace(/\s+/g, '_')}.pdf`.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      const outputPath = path.join(targetDir, fileName);
      
      event.sender.send('export-progress', {
        current: i,
        total: classes.length,
        status: `Génération du PDF pour la classe : ${level}`
      });
      
      try {
        await pdfGenerator.generateLevelPDF(level, outputPath);
        successCount++;
      } catch (err) {
        console.error(`Failed to export PDF for class ${level}:`, err);
      }
    }
    
    event.sender.send('export-progress', {
      current: classes.length,
      total: classes.length,
      status: `Génération terminée !`
    });
    
    return {
      success: true,
      message: `Exportation globale terminée avec succès ! ${successCount} fichiers PDF de classe générés dans le dossier.`
    };
    
  } catch (error) {
    console.error('Error in global PDF export:', error);
    return { success: false, message: error.message || 'Une erreur est survenue lors de l\'exportation globale.' };
  }
});

// 14. Export all merit lists in the database (global PDF export: one PDF per class/level)
ipcMain.handle('export-all-merits', async (event) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Sélectionner le dossier d\'exportation pour tous les palmarès de mérite',
      properties: ['openDirectory', 'createDirectory']
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: 'Exportation annulée.' };
    }
    
    const targetDir = result.filePaths[0];
    
    // Get unique classes
    const classesData = await db.Eleve.findAll({
      attributes: [[db.sequelize.fn('DISTINCT', db.sequelize.col('classe')), 'classe']],
      order: [['classe', 'ASC']]
    });
    
    const classes = classesData.map(c => c.classe);
    if (classes.length === 0) {
      return { success: false, message: 'Aucun élève trouvé. Veuillez d\'abord importer le fichier Excel.' };
    }
    
    const pdfGenerator = require('./services/pdfGenerator');
    let successCount = 0;
    
    for (let i = 0; i < classes.length; i++) {
      const level = classes[i];
      const fileName = `Palmares_Merite_${level.replace(/\s+/g, '_')}.pdf`.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      const outputPath = path.join(targetDir, fileName);
      
      event.sender.send('export-progress', {
        current: i,
        total: classes.length,
        status: `Génération du palmarès pour la classe : ${level}`
      });
      
      try {
        await pdfGenerator.generateMeritListPDF(level, outputPath);
        successCount++;
      } catch (err) {
        console.error(`Failed to export merit PDF for class ${level}:`, err);
      }
    }
    
    event.sender.send('export-progress', {
      current: classes.length,
      total: classes.length,
      status: `Génération terminée !`
    });
    
    return {
      success: true,
      message: `Exportation de tous les palmarès de mérite terminée ! ${successCount} fichiers PDF de classe générés dans le dossier.`
    };
    
  } catch (error) {
    console.error('Error in global merit PDF export:', error);
    return { success: false, message: error.message || 'Une erreur est survenue lors de l\'exportation globale des palmarès.' };
  }
});
