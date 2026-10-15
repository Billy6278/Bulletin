'use strict';

const ExcelJS = require('exceljs');
const db = require('../models');
const calculator = require('./calculator');

/**
 * Formats rank with suffix (e.g. 1 -> 1er, 2 -> 2ème)
 */
function formatRank(rank) {
  if (rank === null || rank === undefined) return '-';
  if (rank === 1) return '1er';
  return `${rank}ème`;
}

/**
 * Generates an Excel report card for a single student.
 */
async function generateStudentReportCard(studentId, level, period, outputPath) {
  // 1. Fetch class calculation results
  const classData = await calculator.calculateClassResults(level, period);
  const studentResult = classData.resultsMap[studentId];
  
  if (!studentResult) {
    throw new Error(`Résultats introuvables pour l'élève ID ${studentId} dans le niveau ${level} et la période ${period}.`);
  }
  
  // 2. Fetch all student info
  const student = await db.Eleve.findByPk(studentId);
  if (!student) {
    throw new Error(`Élève ID ${studentId} introuvable.`);
  }
  
  // 3. Fetch school metadata from Config
  let schoolName = 'Nom de l\'Établissement';
  let schoolYear = 'Année Scolaire 2025-2026';
  let schoolLogo = ''; // Base64
  
  try {
    const nameCfg = await db.Config.findOne({ where: { key: 'school_name' } });
    if (nameCfg && nameCfg.value) schoolName = nameCfg.value;
    
    const yearCfg = await db.Config.findOne({ where: { key: 'school_year' } });
    if (yearCfg && yearCfg.value) schoolYear = yearCfg.value;
    
    const logoCfg = await db.Config.findOne({ where: { key: 'school_logo' } });
    if (logoCfg && logoCfg.value) schoolLogo = logoCfg.value;
  } catch (err) {
    console.error('Error fetching school config:', err);
  }
  
  // 4. Fetch notes for ALL periods to construct comparison
  const allNotes = await db.Note.findAll({
    where: { eleveId: studentId },
    include: [{ model: db.Matiere, as: 'matiere' }]
  });
  
  // Get all unique subjects for this student
  const matieres = await db.Matiere.findAll();
  const matieresMap = {};
  matieres.forEach(m => {
    matieresMap[m.id] = m;
  });
  
  // Group notes by subject ID and period
  const noteBySubjectAndPeriod = {};
  allNotes.forEach(n => {
    if (!noteBySubjectAndPeriod[n.matiereId]) {
      noteBySubjectAndPeriod[n.matiereId] = { '1er': null, '2ème': null };
    }
    // Normalize period name
    let pKey = n.periode;
    if (pKey === '2em') pKey = '2ème';
    noteBySubjectAndPeriod[n.matiereId][pKey] = n.note;
  });
  
  // Only include subjects that have at least one grade in the selected period for this class
  // or that belong to this student's grade records
  const studentSubjectIds = [...new Set(allNotes.map(n => n.matiereId))];
  
  // 5. Create Excel Workbook and Worksheet
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Bulletin');
  
  // Hide grid lines for a cleaner printable look
  worksheet.views = [{ showGridLines: false }];
  
  // Setup columns
  worksheet.columns = [
    { key: 'num', width: 6 },
    { key: 'matiere', width: 26 },
    { key: 'coeff', width: 12 },
    { key: 'note_p1', width: 14 },
    { key: 'note_p2', width: 14 },
    { key: 'note_p3', width: 14 },
    { key: 'total', width: 14 }
  ];
  
  // Define styles
  const fontTitle = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FF1E3A8A' } };
  const fontSubtitle = { name: 'Segoe UI', size: 11, italic: true, color: { argb: 'FF475569' } };
  const fontSection = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FF1E293B' } };
  const fontTableHeader = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  const fontBody = { name: 'Segoe UI', size: 10 };
  const fontBold = { name: 'Segoe UI', size: 10, bold: true };
  const fontStatVal = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FF1E3A8A' } };
  
  const fillHeader = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  const fillZebra = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  const fillTotalRow = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  
  const borderThin = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  };
  const borderDoubleBottom = {
    bottom: { style: 'double', color: { argb: 'FF1E3A8A' } }
  };
  
  const alignCenter = { vertical: 'middle', horizontal: 'center' };
  const alignLeft = { vertical: 'middle', horizontal: 'left' };
  const alignRight = { vertical: 'middle', horizontal: 'right' };
  
  // 6. Build School Header
  // School Name
  worksheet.mergeCells('A1:G1');
  const cellSchool = worksheet.getCell('A1');
  cellSchool.value = schoolName.toUpperCase();
  cellSchool.font = fontTitle;
  cellSchool.alignment = alignCenter;
  worksheet.getRow(1).height = 25;
  
  // School Year
  worksheet.mergeCells('A2:G2');
  const cellYear = worksheet.getCell('A2');
  cellYear.value = schoolYear;
  cellYear.font = fontSubtitle;
  cellYear.alignment = alignCenter;
  worksheet.getRow(2).height = 18;
  
  // Document Title
  worksheet.mergeCells('A3:G3');
  const cellTitle = worksheet.getCell('A3');
  cellTitle.value = `BULLETIN SCOLAIRE - ${period.toUpperCase()}`;
  cellTitle.font = { name: 'Segoe UI', size: 13, bold: true, color: { argb: 'FF0F172A' } };
  cellTitle.alignment = alignCenter;
  cellTitle.border = borderDoubleBottom;
  worksheet.getRow(3).height = 22;
  
  // Add image logo if available
  if (schoolLogo) {
    try {
      // If logo is a base64 string, we can add it to the workbook
      // Format: "data:image/png;base64,iVBOR..."
      const base64Data = schoolLogo.replace(/^data:image\/\w+;base64,/, '');
      const imageId = workbook.addImage({
        base64: base64Data,
        extension: 'png'
      });
      worksheet.addImage(imageId, {
        tl: { col: 0.1, row: 0.1 },
        ext: { width: 60, height: 60 }
      });
    } catch (e) {
      console.error('Failed to add school logo image to Excel:', e);
    }
  }
  
  // Space
  worksheet.getRow(4).height = 10;
  
  // 7. Student Info Card
  worksheet.getRow(5).height = 20;
  worksheet.mergeCells('A5:C5');
  const cellName = worksheet.getCell('A5');
  cellName.value = `Élève : ${student.prenom} ${student.nom}`;
  cellName.font = fontSection;
  cellName.alignment = alignLeft;
  
  worksheet.mergeCells('E5:G5');
  const cellMatricule = worksheet.getCell('E5');
  cellMatricule.value = `Matricule : ${student.matricule || '-'}`;
  cellMatricule.font = fontBold;
  cellMatricule.alignment = alignRight;
  
  worksheet.getRow(6).height = 20;
  worksheet.mergeCells('A6:C6');
  const cellClasse = worksheet.getCell('A6');
  cellClasse.value = `Classe : ${level}`;
  cellClasse.font = fontSubtitle;
  cellClasse.alignment = alignLeft;
  
  worksheet.mergeCells('E6:G6');
  const cellEffectif = worksheet.getCell('E6');
  cellEffectif.value = `Effectif de la classe : ${classData.totalStudents} élèves`;
  cellEffectif.font = fontSubtitle;
  cellEffectif.alignment = alignRight;
  
  // Space before table
  worksheet.getRow(7).height = 15;
  
  // 8. Grades Table Header
  const headerRow = worksheet.getRow(8);
  headerRow.height = 25;
  const headerLabels = [
    'N°',
    'MATIÈRE',
    'COEFF',
    '1er Semestre',
    '2ème Semestre',
    'Total'
  ];
  
  for (let colIdx = 0; colIdx < headerLabels.length; colIdx++) {
    const cell = headerRow.getCell(colIdx + 1);
    cell.value = headerLabels[colIdx];
    cell.font = fontTableHeader;
    cell.fill = fillHeader;
    cell.alignment = alignCenter;
    cell.border = borderThin;
  }
  
  // 9. Populate Grades Rows
  let currentRowNum = 9;
  let totalCoeff = 0;
  let totalWeightedGrades = 0;
  let hasActiveGrades = false;
  
  studentSubjectIds.forEach((matiereId, idx) => {
    const row = worksheet.getRow(currentRowNum);
    row.height = 20;
    
    const subject = matieresMap[matiereId];
    const subjectName = subject ? subject.nom : 'Matière';
    const coeff = subject ? (subject.coefficient || 1) : 1;
    
    const periodGrades = noteBySubjectAndPeriod[matiereId] || { '1er': null, '2ème': null };
    
    // Notes for each period
    const noteP1 = periodGrades['1er'];
    const noteP2 = periodGrades['2ème'];
    
    // Grade in selected period
    let activeGrade = null;
    if (period === '1er') activeGrade = noteP1;
    else if (period === '2ème') activeGrade = noteP2;
    
    let weightedTotal = '';
    if (activeGrade !== null && activeGrade !== undefined) {
      weightedTotal = activeGrade * coeff;
      totalWeightedGrades += weightedTotal;
      totalCoeff += coeff;
      hasActiveGrades = true;
    }
    
    const isZebra = (currentRowNum % 2 === 0);
    const rowFill = isZebra ? fillZebra : null;
    
    const values = [
      idx + 1,
      subjectName,
      coeff,
      noteP1 !== null && noteP1 !== undefined ? noteP1 : '-',
      noteP2 !== null && noteP2 !== undefined ? noteP2 : '-',
      weightedTotal !== '' ? weightedTotal : '-'
    ];
    
    for (let c = 0; c < values.length; c++) {
      const cell = row.getCell(c + 1);
      cell.value = values[c];
      cell.font = fontBody;
      cell.border = borderThin;
      
      if (rowFill) {
        cell.fill = rowFill;
      }
      
      if (c === 1) {
        cell.alignment = alignLeft;
      } else {
        cell.alignment = alignCenter;
      }
    }
    
    currentRowNum++;
  });
  
  // 10. Add Totals Row
  const totalRow = worksheet.getRow(currentRowNum);
  totalRow.height = 22;
  
  worksheet.mergeCells(`A${currentRowNum}:B${currentRowNum}`);
  const cellTotalLabel = totalRow.getCell(1);
  cellTotalLabel.value = 'TOTAL';
  cellTotalLabel.font = fontBold;
  cellTotalLabel.alignment = alignLeft;
  
  const cellTotalCoeff = totalRow.getCell(3);
  cellTotalCoeff.value = hasActiveGrades ? totalCoeff : '-';
  cellTotalCoeff.font = fontBold;
  cellTotalCoeff.alignment = alignCenter;
  
  // Fill in blanks for period columns in total row
  for (let c = 4; c <= 5; c++) {
    const cell = totalRow.getCell(c);
    cell.value = '';
    cell.alignment = alignCenter;
  }
  
  const cellTotalWeighted = totalRow.getCell(6);
  cellTotalWeighted.value = hasActiveGrades ? totalWeightedGrades : '-';
  cellTotalWeighted.font = fontBold;
  cellTotalWeighted.alignment = alignCenter;
  
  // Apply borders and fill to entire total row
  for (let c = 1; c <= 6; c++) {
    const cell = totalRow.getCell(c);
    cell.border = borderThin;
    cell.fill = fillTotalRow;
  }
  
  currentRowNum++;
  
  // Space before performance summary
  worksheet.getRow(currentRowNum).height = 15;
  currentRowNum++;
  
  // Calculate average for each period
  let sumCoeffP1 = 0, sumGradeP1 = 0;
  let sumCoeffP2 = 0, sumGradeP2 = 0;
  
  studentSubjectIds.forEach(matiereId => {
    const subject = matieresMap[matiereId];
    const coeff = subject ? (subject.coefficient || 1) : 1;
    const periodGrades = noteBySubjectAndPeriod[matiereId] || { '1er': null, '2ème': null };
    
    const noteP1 = periodGrades['1er'];
    const noteP2 = periodGrades['2ème'];
    
    if (noteP1 !== null && noteP1 !== undefined) {
      sumGradeP1 += noteP1 * coeff;
      sumCoeffP1 += coeff;
    }
    if (noteP2 !== null && noteP2 !== undefined) {
      sumGradeP2 += noteP2 * coeff;
      sumCoeffP2 += coeff;
    }
  });
  
  const avgP1 = sumCoeffP1 > 0 ? sumGradeP1 / sumCoeffP1 : null;
  const avgP2 = sumCoeffP2 > 0 ? sumGradeP2 / sumCoeffP2 : null;
  
  const avgs = [avgP1, avgP2].filter(a => a !== null);
  const avgAnnual = avgs.length > 0 ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
  
  // 11. Add Performance Summary Card (Total, Average, Rank, Appreciation)
  const summaryRows = [
    { label: 'Moyenne du 1er Semestre', value: avgP1 !== null ? `${avgP1.toFixed(2)}` : '-' },
    { label: 'Moyenne du 2ème Semestre', value: avgP2 !== null ? `${avgP2.toFixed(2)}` : '-' },
    { label: 'Moyenne Annuelle', value: avgAnnual !== null ? `${avgAnnual.toFixed(2)}` : '-', isBold: true },
    { label: 'Rang de l\'élève', value: studentResult.rank === null ? '-' : (studentResult.rank === 1 ? `1er / ${classData.totalStudents} élèves` : `${studentResult.rank}ème / ${classData.totalStudents} élèves`), isBold: true },
    { label: 'Appréciation', value: studentResult.appreciation || '-', isBold: true }
  ];
  
  summaryRows.forEach(sr => {
    const row = worksheet.getRow(currentRowNum);
    row.height = 20;
    
    // Merge A to D for Label
    worksheet.mergeCells(`A${currentRowNum}:D${currentRowNum}`);
    const cellLabel = row.getCell(1);
    cellLabel.value = `  ${sr.label}`;
    cellLabel.font = sr.isBold ? fontBold : fontBody;
    cellLabel.alignment = alignLeft;
    
    // Merge E to F for Value
    worksheet.mergeCells(`E${currentRowNum}:F${currentRowNum}`);
    const cellVal = row.getCell(5);
    cellVal.value = sr.value;
    cellVal.font = sr.isBold ? fontStatVal : fontBody;
    cellVal.alignment = alignCenter;
    
    // Set borders and background fills
    for (let c = 1; c <= 6; c++) {
      const cell = row.getCell(c);
      cell.border = borderThin;
      if (sr.isBold) {
        cell.fill = fillZebra;
      }
    }
    
    currentRowNum++;
  });
  
  currentRowNum++; // spacer row
  
  // 12. Add Signatures section below summary card
  const sigRow = currentRowNum;
  worksheet.mergeCells(`E${sigRow}:F${sigRow}`);
  const cellSigTitle = worksheet.getCell(`E${sigRow}`);
  cellSigTitle.value = 'Le Chef d\'Établissement';
  cellSigTitle.font = fontBold;
  cellSigTitle.alignment = alignCenter;
  
  worksheet.mergeCells(`E${sigRow + 1}:F${sigRow + 4}`);
  const cellSigSpace = worksheet.getCell(`E${sigRow + 1}`);
  cellSigSpace.value = '\n\n(Signature & Cachet)';
  cellSigSpace.font = fontSubtitle;
  cellSigSpace.alignment = alignCenter;
  
  // 13. Page Setup for Direct Printing
  worksheet.pageSetup.margins = {
    left: 0.4,
    right: 0.4,
    top: 0.4,
    bottom: 0.4,
    header: 0.2,
    footer: 0.2
  };
  worksheet.pageSetup.orientation = 'portrait';
  worksheet.pageSetup.fitToPage = true;
  worksheet.pageSetup.fitToWidth = 1;
  worksheet.pageSetup.fitToHeight = 1;
  
  // Write file
  await workbook.xlsx.writeFile(outputPath);
  
  return {
    success: true,
    message: `Bulletin exporté avec succès à : ${outputPath}`
  };
}

module.exports = {
  generateStudentReportCard,
  formatRank
};
