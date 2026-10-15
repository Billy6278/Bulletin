'use strict';

const ExcelJS = require('exceljs');
const db = require('../models');

/**
 * Parses sheet name to extract level and period.
 * Example: "CP1-1er" -> { level: "CP1", period: "1er" }
 *          "CE1 A - Semestre 2" -> { level: "CE1 A", period: "2ème" }
 */
function parseSheetName(name) {
  const cleaned = name.trim();

  let period = '1er';
  let level = cleaned;
  
  const match3 = cleaned.match(/(?:^|[\s\-_]|\b)(3ème|3em|3e|Semestre\s+3|Trimestre\s+3|S3)$/i);
  const match2 = cleaned.match(/(?:^|[\s\-_]|\b)(2ème|2em|2e|Semestre\s+2|Trimestre\s+2|S2)$/i);
  const match1 = cleaned.match(/(?:^|[\s\-_]|\b)(1er|1em|1e|Semestre\s+1|Trimestre\s+1|S1)$/i);
  
  if (match3) {
    period = '3ème';
    level = cleaned.replace(match3[0], '').replace(/[-_]/g, ' ').trim();
  } else if (match2) {
    period = '2ème';
    level = cleaned.replace(match2[0], '').replace(/[-_]/g, ' ').trim();
  } else if (match1) {
    period = '1er';
    level = cleaned.replace(match1[0], '').replace(/[-_]/g, ' ').trim();
  }
  
  level = level.replace(/\s+/g, ' ').trim();
  return { level, period };
}

/**
 * Splits fullName into prenom and nom.
 * Example: "ABDOULAYE BARRY" -> { prenom: "ABDOULAYE", nom: "BARRY" }
 */
function splitName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { prenom: '', nom: parts[0] };
  }
  const nom = parts[parts.length - 1];
  const prenom = parts.slice(0, -1).join(' ');
  return { prenom, nom };
}

/**
 * Computes Levenshtein distance between two strings.
 */
function levenshtein(a, b) {
  const tmp = [];
  let i, j;
  for (i = 0; i <= a.length; i++) {
    tmp.push([i]);
  }
  for (j = 1; j <= b.length; j++) {
    tmp[0].push(j);
  }
  for (i = 1; i <= a.length; i++) {
    for (j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
}

/**
 * Main parser function to import Excel data into SQLite using ExcelJS.
 */
async function importExcelFile(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  
  const parsedData = [];
  const subjectCoeffsMap = {};
  
  workbook.eachSheet((worksheet) => {
    const sheetName = worksheet.name;
    if (sheetName.toLowerCase() === 'feuil1') return; // Skip default empty sheet
    
    // Parse Sheet Name
    const { level, period } = parseSheetName(sheetName);
    if (!level) return;
    
    // Load rows manually from exceljs worksheet
    const rows = [];
    const maxCols = worksheet.columnCount;
    
    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const rowVals = [];
      for (let c = 1; c <= maxCols; c++) {
        const cell = row.getCell(c);
        let val = cell.value;
        
        // Handle ExcelJS Cell object formulas, links, rich text, etc.
        if (val && typeof val === 'object') {
          if (val.result !== undefined) {
            val = val.result;
          } else if (val.text !== undefined) {
            val = val.text;
          } else if (val.richText !== undefined) {
            val = val.richText.map(rt => rt.text || '').join('');
          } else {
            val = '';
          }
        }
        rowVals.push(val);
      }
      rows.push({ rowNumber, values: rowVals });
    });
    
    if (rows.length === 0) return;
    
    // Find Header Row
    let headerRowIndex = -1;
    for (let r = 0; r < Math.min(15, rows.length); r++) {
      const rowVals = rows[r].values;
      let hasNum = false;
      let hasName = false;
      for (let c = 0; c < rowVals.length; c++) {
        const val = rowVals[c] === null || rowVals[c] === undefined ? '' : String(rowVals[c]).trim();
        if (val.match(/^N°/i) || val === 'N°' || val === 'N' || val === 'N.' || val.match(/^N\s*°/i)) {
          hasNum = true;
        }
        if (val.toLowerCase().includes('nom') || val.toLowerCase().includes('prenom')) {
          hasName = true;
        }
      }
      if (hasNum && hasName) {
        headerRowIndex = r;
        break;
      }
    }
    
    if (headerRowIndex === -1) {
      console.log(`[ExcelParser] Header row not found in sheet: ${sheetName}`);
      return;
    }
    
    // Extract columns mapping
    const headers = rows[headerRowIndex].values.map(h => h === null || h === undefined ? '' : String(h).trim());
    let numIdx = -1;
    let nameIdx = -1;
    for (let c = 0; c < headers.length; c++) {
      const h = headers[c];
      if (numIdx === -1 && (h.match(/^N°/i) || h === 'N°' || h === 'N' || h === 'N.' || h.match(/^N\s*°/i))) {
        numIdx = c;
      }
      if (nameIdx === -1 && (h.toLowerCase().includes('nom') || h.toLowerCase().includes('prenom'))) {
        nameIdx = c;
      }
    }
    
    if (nameIdx === -1) {
      console.log(`[ExcelParser] Student name column not found in sheet: ${sheetName}`);
      return;
    }
    
    // Extract Subjects
    const metadataRegex = /^(total|moyenne|rang|appr[eé]ciation)/i;
    const subjects = [];
    const coeffRowVals = headerRowIndex > 0 ? rows[headerRowIndex - 1].values : null;
    
    for (let c = nameIdx + 1; c < headers.length; c++) {
      const h = headers[c];
      if (!h) continue;
      if (metadataRegex.test(h)) continue;
      
      let coefficient = 1;
      if (coeffRowVals && coeffRowVals[c] !== undefined && coeffRowVals[c] !== null && coeffRowVals[c] !== '') {
        const parsedCoeff = parseFloat(String(coeffRowVals[c]).replace(',', '.'));
        if (!isNaN(parsedCoeff) && parsedCoeff > 0) {
          coefficient = parsedCoeff;
        }
      }
      
      subjects.push({ name: h, colIdx: c });
      subjectCoeffsMap[h] = coefficient;
    }
    
    // Extract Student Grades
    const students = [];
    for (let r = headerRowIndex + 1; r < rows.length; r++) {
      const rowVals = rows[r].values;
      const studentName = rowVals[nameIdx] === null || rowVals[nameIdx] === undefined ? '' : String(rowVals[nameIdx]).trim();
      if (!studentName) continue;
      
      // Skip summary / stats rows
      const lowerName = studentName.toLowerCase();
      if (lowerName.startsWith('total') || lowerName.startsWith('moyenne') || lowerName.startsWith('effectif') || lowerName.startsWith('statist') || lowerName.startsWith('classe')) {
        continue;
      }
      
      const studentNumStr = rowVals[numIdx] === null || rowVals[numIdx] === undefined ? '' : String(rowVals[numIdx]).trim();
      const studentNumVal = parseInt(studentNumStr) || (r - headerRowIndex);
      
      const grades = [];
      subjects.forEach(subj => {
        const val = rowVals[subj.colIdx];
        let grade = null;
        if (val !== null && val !== undefined && val !== '') {
          grade = parseFloat(String(val).replace(',', '.'));
          if (isNaN(grade)) {
            grade = null;
          }
        }
        grades.push({ subjectName: subj.name, note: grade });
      });
      
      students.push({
        num: studentNumVal,
        fullName: studentName,
        grades
      });
    }
    
    parsedData.push({
      level,
      period,
      students
    });
  });
  
  if (parsedData.length === 0) {
    throw new Error('Aucune feuille de classe valide trouvée dans le fichier Excel.');
  }
  
  // Database operations in transactions
  await db.sequelize.transaction(async (t) => {
    // Delete existing records to sync fresh from Excel
    await db.Note.destroy({ where: {}, transaction: t });
    await db.Eleve.destroy({ where: {}, transaction: t });
    await db.Matiere.destroy({ where: {}, transaction: t });
    
    // Create Subjects (Matieres)
    const subjectInstances = {};
    for (const name of Object.keys(subjectCoeffsMap)) {
      const subject = await db.Matiere.create({
        nom: name,
        coefficient: subjectCoeffsMap[name]
      }, { transaction: t });
      subjectInstances[name] = subject;
    }
    
    // Create Students and Notes
    for (const classData of parsedData) {
      const { level, period, students } = classData;
      
      for (const st of students) {
        const { prenom, nom } = splitName(st.fullName);
        const norm = (str) => (str || '').toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]/g, '');

        const targetFull = norm(prenom + nom);
        const allClassStudents = await db.Eleve.findAll({
          where: { classe: level },
          transaction: t
        });
        
        let eleve = allClassStudents.find(s => {
          const sFull = norm(s.prenom + s.nom);
          if (sFull === targetFull) return true;
          if (sFull.startsWith(targetFull) || targetFull.startsWith(sFull)) {
            if (Math.min(sFull.length, targetFull.length) > 5) return true;
          }
          // Levenshtein distance check with 15% threshold
          const maxLen = Math.max(sFull.length, targetFull.length);
          if (maxLen > 5) {
            const dist = levenshtein(sFull, targetFull);
            if (dist <= maxLen * 0.15) return true;
          }
          return false;
        });
        
        if (!eleve) {
          const matricule = `MAT-${level.replace(/\s+/g, '')}-${st.num.toString().padStart(3, '0')}`;
          let finalMatricule = matricule;
          let isMatriculeTaken = await db.Eleve.findOne({ where: { matricule: finalMatricule, classe: level }, transaction: t });
          if (isMatriculeTaken) {
            let suffix = 1;
            while (await db.Eleve.findOne({ where: { matricule: `MAT-${level.replace(/\s+/g, '')}-${(st.num + suffix).toString().padStart(3, '0')}`, classe: level }, transaction: t })) {
              suffix++;
            }
            finalMatricule = `MAT-${level.replace(/\s+/g, '')}-${(st.num + suffix).toString().padStart(3, '0')}`;
          }
          
          eleve = await db.Eleve.create({
            matricule: finalMatricule,
            prenom,
            nom,
            classe: level
          }, { transaction: t });
        }
        
        for (const gd of st.grades) {
          const subject = subjectInstances[gd.subjectName];
          if (!subject) continue;
          
          await db.Note.create({
            eleveId: eleve.id,
            matiereId: subject.id,
            note: gd.note,
            periode: period
          }, { transaction: t });
        }
      }
    }
  });
  
  return {
    success: true,
    message: `Fichier importé avec succès. ${parsedData.length} périodes chargées.`
  };
}

module.exports = {
  importExcelFile,
  parseSheetName,
  splitName
};
