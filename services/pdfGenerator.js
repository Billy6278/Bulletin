'use strict';

const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('../models');
const calculator = require('./calculator');

function getLogoBase64() {
  const logoPath = '/home/billy-nankouman-keita/Documents/Bulletin/logo.jpg';
  if (fs.existsSync(logoPath)) {
    const data = fs.readFileSync(logoPath);
    return `data:image/jpeg;base64,${data.toString('base64')}`;
  }
  return '';
}

async function generateLevelPDF(level, outputPath) {
  // 1. Fetch all students in this level
  const students = await db.Eleve.findAll({
    where: { classe: level },
    order: [['nom', 'ASC'], ['prenom', 'ASC']]
  });

  if (students.length === 0) {
    throw new Error(`Aucun élève trouvé dans le niveau ${level}`);
  }

  // 2. Fetch all subjects taught in this class
  const studentIds = students.map(s => s.id);
  const classNotes = await db.Note.findAll({
    where: { eleveId: studentIds },
    include: [{ model: db.Matiere, as: 'matiere' }]
  });
  const classMatiereMap = new Map();
  classNotes.forEach(cn => {
    if (cn.matiere) {
      classMatiereMap.set(cn.matiereId, cn.matiere);
    }
  });
  const matieres = Array.from(classMatiereMap.values()).sort((a, b) => a.nom.localeCompare(b.nom));

  // 3. Calculate results for each period dynamically
  const classNotesList = await db.Note.findAll({
    include: [{
      model: db.Eleve,
      as: 'eleve',
      where: { classe: level }
    }]
  });
  const uniquePeriods = Array.from(new Set(classNotesList.map(n => n.periode)));
  const periodOrder = { '1er': 1, '2ème': 2, '3ème': 3 };
  let periods = uniquePeriods.sort((a, b) => (periodOrder[a] || 99) - (periodOrder[b] || 99));
  if (periods.length === 0) {
    periods = ['1er', '2ème'];
  }

  const periodResults = {};
  for (const p of periods) {
    periodResults[p] = await calculator.calculateClassResults(level, p);
  }

  // 4. Calculate annual averages
  const studentAnnualData = [];
  for (const student of students) {
    let sumAvgs = 0;
    let hasAnyAvg = false;
    periods.forEach(p => {
      const avg = periodResults[p].resultsMap[student.id]?.average;
      if (avg !== null && avg !== undefined) {
        sumAvgs += avg;
        hasAnyAvg = true;
      }
    });
    const avgAnnual = hasAnyAvg ? (sumAvgs / periods.length) : null;

    const dataObj = {
      studentId: student.id,
      student,
      avgAnnual
    };
    periods.forEach(p => {
      dataObj['avg' + p] = periodResults[p].resultsMap[student.id]?.average ?? null;
    });

    studentAnnualData.push(dataObj);
  }

  // Rank students annually
  const gradedAnnual = studentAnnualData.filter(s => s.avgAnnual !== null);
  const ungradedAnnual = studentAnnualData.filter(s => s.avgAnnual === null);
  gradedAnnual.sort((a, b) => b.avgAnnual - a.avgAnnual);

  gradedAnnual.forEach((student, index) => {
    if (index > 0 && student.avgAnnual === gradedAnnual[index - 1].avgAnnual) {
      student.rankAnnual = gradedAnnual[index - 1].rankAnnual;
    } else {
      student.rankAnnual = index + 1;
    }
  });

  ungradedAnnual.forEach(student => {
    student.rankAnnual = null;
  });

  const annualMap = {};
  [...gradedAnnual, ...ungradedAnnual].forEach(s => {
    annualMap[s.studentId] = s;
  });

  const totalStudents = gradedAnnual.length;
  const logoBase64 = getLogoBase64();
  const scale = await calculator.getGradingScale();

  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page {
          size: A4 portrait;
          margin: 0;
        }
        body {
          margin: 0;
          padding: 0;
          font-family: 'Times New Roman', Times, serif;
          background: white;
        }
        .bulletin-page {
          width: 210mm;
          height: 297mm;
          padding: 10mm;
          box-sizing: border-box;
          page-break-after: always;
          display: flex;
          flex-direction: column;
        }
        .bulletin-page:last-child {
          page-break-after: avoid;
        }
        .bulletin-border {
          border: 1px solid black;
          width: 100%;
          height: 100%;
          padding: 12px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
        }
        .header-table {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 8px;
        }
        .header-left {
          width: 35%;
          text-align: left;
          font-size: 11px;
          line-height: 1.3;
          font-weight: bold;
        }
        .header-center {
          width: 30%;
          text-align: center;
        }
        .header-center img {
          height: 60px;
          object-fit: contain;
        }
        .header-right {
          width: 35%;
          text-align: right;
          font-size: 11px;
          line-height: 1.3;
          font-weight: bold;
        }
        .flag-line {
          width: 80px;
          height: 3px;
          background: linear-gradient(to right, #ce1126 33%, #fcd116 33%, #fcd116 66%, #009460 66%);
          margin-left: auto;
          margin-top: 4px;
        }
        .title-container {
          text-align: center;
          margin-bottom: 8px;
        }
        .title-school {
          font-size: 18px;
          margin: 0;
          font-weight: bold;
          text-transform: uppercase;
        }
        .title-box {
          display: inline-block;
          border: 1.5px solid black;
          border-radius: 6px;
          padding: 4px 16px;
          margin-top: 4px;
          font-weight: bold;
          font-size: 16px;
        }
        .meta-info {
          width: 100%;
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          font-weight: bold;
          margin-bottom: 8px;
        }
        .separator {
          border-top: 1.5px dashed black;
          margin-bottom: 8px;
          width: 100%;
        }
        .student-meta {
          width: 100%;
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          font-weight: bold;
          margin-bottom: 8px;
        }
        .grades-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 8px;
          font-size: 12px;
        }
        .grades-table th {
          background-color: #0b5394;
          color: white;
          border: 1px solid black;
          padding: 4px;
          font-weight: bold;
        }
        .grades-table td {
          border: 1px solid black;
          padding: 4px;
          text-align: center;
        }
        .summary-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 12px;
          font-size: 12px;
        }
        .summary-table td {
          border: 1px solid black;
          padding: 4px;
        }
        .signatures-box {
          margin-top: auto;
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          font-weight: bold;
          padding: 0 10px;
        }
      </style>
    </head>
    <body>
  `;

  for (const student of students) {
    const annualData = annualMap[student.id];

    const notes = await db.Note.findAll({
      where: { eleveId: student.id },
      include: [{ model: db.Matiere, as: 'matiere' }]
    });

    const notesMap = {};
    matieres.forEach(m => {
      const gradesObj = {};
      periods.forEach(p => {
        gradesObj[p] = null;
      });
      notesMap[m.id] = {
        matiereName: m.nom,
        coefficient: m.coefficient || 1,
        grades: gradesObj
      };
    });

    notes.forEach(n => {
      if (notesMap[n.matiereId]) {
        notesMap[n.matiereId].grades[n.periode] = n.note;
      }
    });

    let rowsHtml = '';
    let idx = 1;
    let totalCoeff = 0;
    
    const periodSums = {};
    const periodHas = {};
    periods.forEach(p => {
      periodSums[p] = 0;
      periodHas[p] = false;
    });

    matieres.forEach(m => {
      const data = notesMap[m.id];
      const coeff = data.coefficient || 1;
      totalCoeff += coeff;

      let gradesColsHtml = '';
      periods.forEach(p => {
        const val = data.grades[p];
        if (val !== null && val !== undefined) {
          periodSums[p] += val * coeff;
          periodHas[p] = true;
          gradesColsHtml += `<td>${val.toFixed(2)}</td>`;
        } else {
          gradesColsHtml += `<td>-</td>`;
        }
      });

      rowsHtml += `
        <tr>
          <td>${idx++}</td>
          <td style="text-align: left; padding-left: 6px;">${data.matiereName}</td>
          <td>${coeff}</td>
          ${gradesColsHtml}
        </tr>
      `;
    });

    const formattedRank = annualData.rankAnnual === null ? '-' : (annualData.rankAnnual === 1 ? `1er / ${totalStudents} élèves` : `${annualData.rankAnnual}ème / ${totalStudents} élèves`);
    const appreciation = calculator.getAppreciation(annualData.avgAnnual, scale);

    const colWidth = Math.floor(40 / periods.length);
    const subjWidth = 100 - 5 - 8 - (colWidth * periods.length);
    
    let headerColsHtml = '';
    periods.forEach(p => {
      headerColsHtml += `<th style="width: ${colWidth}%;">${p} Semestre</th>`;
    });

    let totalsColsHtml = '';
    periods.forEach(p => {
      const hasP = periodHas[p];
      const sumP = periodSums[p];
      totalsColsHtml += `<td>${hasP ? sumP.toFixed(2) : '-'}</td>`;
    });

    let summaryRowsHtml = '';
    periods.forEach(p => {
      const avgVal = periodResults[p].resultsMap[student.id]?.average ?? null;
      summaryRowsHtml += `
        <tr>
          <td style="width: 70%; font-weight: bold; text-align: left; padding-left: 6px;">Moyenne du ${p} semestre</td>
          <td style="width: 30%; font-weight: bold; color: #0b5394; text-align: center;">${avgVal !== null ? avgVal.toFixed(2) + ' / 20' : '-'}</td>
        </tr>
      `;
    });

    html += `
      <div class="bulletin-page">
        <div class="bulletin-border">
          
          <!-- Header -->
          <div class="header-table">
            <div class="header-left">
              MINISTERE DE L'ENSEIGNEMENT<br>
              PRE-UNIVERSITAIRE ET DE<br>
              L'ALPHABETISATION
            </div>
            <div class="header-center">
              ${logoBase64 ? `<img src="${logoBase64}">` : ''}
            </div>
            <div class="header-right">
              REPUBLIQUE DE GUINEE<br>
              <span style="font-size: 10px; font-weight: normal;">Travail-Justice-Solidarité</span><br>
              <div class="flag-line"></div>
            </div>
          </div>
          
          <!-- School & Title -->
          <div class="title-container">
            <h2 class="title-school">GROUPE SCOLAIRE DJOMA SAVOIR</h2>
            <div class="title-box">Bulletin de notes annuelles</div>
          </div>
          
          <!-- Meta Info -->
          <div class="meta-info">
            <div style="line-height: 1.4;">
              IRE : KINDIA<br>
              DPE : DUBREKA<br>
              DSEE : DUBREKA<br>
              ANNEE : 2026
            </div>
            <div style="line-height: 1.4; text-align: right;">
              Cycle : Collège<br>
              Classe : ${student.classe}
            </div>
          </div>
          
          <div class="separator"></div>
          
          <!-- Student Meta -->
          <div class="student-meta">
            <div>
              Prénom et Nom : <span style="font-weight: normal;">${student.prenom} ${student.nom}</span>
            </div>
            <div style="text-align: right; display: flex; gap: 20px;">
              <span>Matricule : <span style="font-weight: normal;">${student.matricule}</span></span>
              <span>Nombre d'élèves : <span style="font-weight: normal;">${totalStudents}</span></span>
            </div>
          </div>
          
          <!-- Table -->
          <table class="grades-table">
            <thead>
              <tr>
                <th style="width: 5%;">N°</th>
                <th style="width: ${subjWidth}%; text-align: left; padding-left: 6px;">Matières</th>
                <th style="width: 8%;">Coeff</th>
                ${headerColsHtml}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr style="font-weight: bold; background-color: #f9f9f9;">
                <td colspan="2" style="text-align: right; padding-right: 6px;">Total</td>
                <td>${totalCoeff}</td>
                ${totalsColsHtml}
              </tr>
            </tbody>
          </table>
          
          <!-- Summary Box -->
          <table class="summary-table">
            ${summaryRowsHtml}
            <tr style="background-color: #f3f3f3; font-size: 13px;">
              <td style="font-weight: bold; text-align: left; padding-left: 6px;">Moyenne annuelle</td>
              <td style="font-weight: bold; color: #0b5394; text-align: center;">${annualData.avgAnnual !== null ? annualData.avgAnnual.toFixed(2) + ' / 20' : '-'}</td>
            </tr>
            <tr>
              <td style="font-weight: bold; text-align: left; padding-left: 6px;">Rang de l'élève</td>
              <td style="font-weight: bold; color: #0b5394; text-align: center;">${formattedRank}</td>
            </tr>
            <tr>
              <td style="font-weight: bold; text-align: left; padding-left: 6px;">Appréciation</td>
              <td style="font-weight: bold; color: #0b5394; text-align: center;">${appreciation}</td>
            </tr>
          </table>
          
          <!-- Signatures -->
          <div class="signatures-box">
            <div style="text-align: center; width: 45%;">
              <span style="text-decoration: underline;">Le Censeur :</span>
              <br><br><br><br>
              M.DEMBA DIALLO
            </div>
            <div style="text-align: center; width: 45%;">
              <span style="text-decoration: underline;">Le Directeur Général :</span>
              <br><br><br><br>
              M.BABADY SOUMAH
            </div>
          </div>
          
        </div>
      </div>
    `;
  }

  html += `
    </body>
    </html>
  `;

  const tempHtmlPath = path.join(__dirname, 'temp_bulletin_level.html');
  fs.writeFileSync(tempHtmlPath, html);

  let tempWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false
    }
  });

  await tempWindow.loadURL(`file://${tempHtmlPath}`);

  const pdfData = await tempWindow.webContents.printToPDF({
    margins: {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0
    },
    pageSize: 'A4',
    printBackground: true
  });

  fs.writeFileSync(outputPath, pdfData);
  tempWindow.destroy();

  try {
    fs.unlinkSync(tempHtmlPath);
  } catch (e) {
    console.error('Error deleting temp HTML file:', e);
  }
}

async function generateStudentPDF(studentId, level, outputPath) {
  // Same as level but filters for a single student id
  const student = await db.Eleve.findByPk(studentId);
  if (!student) throw new Error('Élève introuvable');

  // Fetch all subjects taught in this class
  const classStudents = await db.Eleve.findAll({
    where: { classe: level }
  });
  const classStudentIds = classStudents.map(s => s.id);
  const classNotes = await db.Note.findAll({
    where: { eleveId: classStudentIds },
    include: [{ model: db.Matiere, as: 'matiere' }]
  });
  const classMatiereMap = new Map();
  classNotes.forEach(cn => {
    if (cn.matiere) {
      classMatiereMap.set(cn.matiereId, cn.matiere);
    }
  });
  const matieres = Array.from(classMatiereMap.values()).sort((a, b) => a.nom.localeCompare(b.nom));

  // Calculate results for each period dynamically
  const classNotesList = await db.Note.findAll({
    include: [{
      model: db.Eleve,
      as: 'eleve',
      where: { classe: level }
    }]
  });
  const uniquePeriods = Array.from(new Set(classNotesList.map(n => n.periode)));
  const periodOrder = { '1er': 1, '2ème': 2, '3ème': 3 };
  let periods = uniquePeriods.sort((a, b) => (periodOrder[a] || 99) - (periodOrder[b] || 99));
  if (periods.length === 0) {
    periods = ['1er', '2ème'];
  }

  const periodResults = {};
  for (const p of periods) {
    periodResults[p] = await calculator.calculateClassResults(level, p);
  }

  const allStudents = await db.Eleve.findAll({
    where: { classe: level },
    order: [['nom', 'ASC'], ['prenom', 'ASC']]
  });

  const studentAnnualData = [];
  for (const st of allStudents) {
    let sumAvgs = 0;
    let hasAnyAvg = false;
    periods.forEach(p => {
      const avg = periodResults[p].resultsMap[st.id]?.average;
      if (avg !== null && avg !== undefined) {
        sumAvgs += avg;
        hasAnyAvg = true;
      }
    });
    const avgAnnual = hasAnyAvg ? (sumAvgs / periods.length) : null;

    studentAnnualData.push({
      studentId: st.id,
      avgAnnual
    });
  }

  const gradedAnnual = studentAnnualData.filter(s => s.avgAnnual !== null);
  gradedAnnual.sort((a, b) => b.avgAnnual - a.avgAnnual);

  gradedAnnual.forEach((st, index) => {
    if (index > 0 && st.avgAnnual === gradedAnnual[index - 1].avgAnnual) {
      st.rankAnnual = gradedAnnual[index - 1].rankAnnual;
    } else {
      st.rankAnnual = index + 1;
    }
  });

  const studentAnnualInfo = studentAnnualData.find(s => s.studentId === student.id);
  const avgAnnual = studentAnnualInfo?.avgAnnual ?? null;
  const rankAnnual = studentAnnualInfo?.rankAnnual ?? null;
  const totalStudents = gradedAnnual.length;

  const logoBase64 = getLogoBase64();
  const scale = await calculator.getGradingScale();

  const notes = await db.Note.findAll({
    where: { eleveId: student.id },
    include: [{ model: db.Matiere, as: 'matiere' }]
  });

  const notesMap = {};
  matieres.forEach(m => {
    const gradesObj = {};
    periods.forEach(p => {
      gradesObj[p] = null;
    });
    notesMap[m.id] = {
      matiereName: m.nom,
      coefficient: m.coefficient || 1,
      grades: gradesObj
    };
  });

  notes.forEach(n => {
    if (notesMap[n.matiereId]) {
      notesMap[n.matiereId].grades[n.periode] = n.note;
    }
  });

  let rowsHtml = '';
  let idx = 1;
  let totalCoeff = 0;

  const periodSums = {};
  const periodHas = {};
  periods.forEach(p => {
    periodSums[p] = 0;
    periodHas[p] = false;
  });

  matieres.forEach(m => {
    const data = notesMap[m.id];
    const coeff = data.coefficient || 1;
    totalCoeff += coeff;

    let gradesColsHtml = '';
    periods.forEach(p => {
      const val = data.grades[p];
      if (val !== null && val !== undefined) {
        periodSums[p] += val * coeff;
        periodHas[p] = true;
        gradesColsHtml += `<td>${val.toFixed(2)}</td>`;
      } else {
        gradesColsHtml += `<td>-</td>`;
      }
    });

    rowsHtml += `
      <tr>
        <td>${idx++}</td>
        <td style="text-align: left; padding-left: 6px;">${data.matiereName}</td>
        <td>${coeff}</td>
        ${gradesColsHtml}
      </tr>
    `;
  });

  const formattedRank = rankAnnual === null ? '-' : (rankAnnual === 1 ? `1er / ${totalStudents} élèves` : `${rankAnnual}ème / ${totalStudents} élèves`);
  const appreciation = calculator.getAppreciation(avgAnnual, scale);

  const colWidth = Math.floor(40 / periods.length);
  const subjWidth = 100 - 5 - 8 - (colWidth * periods.length);
  
  let headerColsHtml = '';
  periods.forEach(p => {
    headerColsHtml += `<th style="width: ${colWidth}%;">${p} Semestre</th>`;
  });

  let totalsColsHtml = '';
  periods.forEach(p => {
    const hasP = periodHas[p];
    const sumP = periodSums[p];
    totalsColsHtml += `<td>${hasP ? sumP.toFixed(2) : '-'}</td>`;
  });

  let summaryRowsHtml = '';
  periods.forEach(p => {
    const avgVal = periodResults[p].resultsMap[student.id]?.average ?? null;
    summaryRowsHtml += `
      <tr>
        <td style="width: 70%; font-weight: bold; text-align: left; padding-left: 6px;">Moyenne du ${p} semestre</td>
        <td style="width: 30%; font-weight: bold; color: #0b5394; text-align: center;">${avgVal !== null ? avgVal.toFixed(2) + ' / 20' : '-'}</td>
      </tr>
    `;
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page {
          size: A4 portrait;
          margin: 0;
        }
        body {
          margin: 0;
          padding: 0;
          font-family: 'Times New Roman', Times, serif;
          background: white;
        }
        .bulletin-page {
          width: 210mm;
          height: 297mm;
          padding: 10mm;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
        }
        .bulletin-border {
          border: 1px solid black;
          width: 100%;
          height: 100%;
          padding: 12px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
        }
        .header-table {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 8px;
        }
        .header-left {
          width: 35%;
          text-align: left;
          font-size: 11px;
          line-height: 1.3;
          font-weight: bold;
        }
        .header-center {
          width: 30%;
          text-align: center;
        }
        .header-center img {
          height: 60px;
          object-fit: contain;
        }
        .header-right {
          width: 35%;
          text-align: right;
          font-size: 11px;
          line-height: 1.3;
          font-weight: bold;
        }
        .flag-line {
          width: 80px;
          height: 3px;
          background: linear-gradient(to right, #ce1126 33%, #fcd116 33%, #fcd116 66%, #009460 66%);
          margin-left: auto;
          margin-top: 4px;
        }
        .title-container {
          text-align: center;
          margin-bottom: 8px;
        }
        .title-school {
          font-size: 18px;
          margin: 0;
          font-weight: bold;
          text-transform: uppercase;
        }
        .title-box {
          display: inline-block;
          border: 1.5px solid black;
          border-radius: 6px;
          padding: 4px 16px;
          margin-top: 4px;
          font-weight: bold;
          font-size: 16px;
        }
        .meta-info {
          width: 100%;
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          font-weight: bold;
          margin-bottom: 8px;
        }
        .separator {
          border-top: 1.5px dashed black;
          margin-bottom: 8px;
          width: 100%;
        }
        .student-meta {
          width: 100%;
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          font-weight: bold;
          margin-bottom: 8px;
        }
        .grades-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 8px;
          font-size: 12px;
        }
        .grades-table th {
          background-color: #0b5394;
          color: white;
          border: 1px solid black;
          padding: 4px;
          font-weight: bold;
        }
        .grades-table td {
          border: 1px solid black;
          padding: 4px;
          text-align: center;
        }
        .summary-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 12px;
          font-size: 12px;
        }
        .summary-table td {
          border: 1px solid black;
          padding: 4px;
        }
        .signatures-box {
          margin-top: auto;
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          font-weight: bold;
          padding: 0 10px;
        }
      </style>
    </head>
    <body>
      <div class="bulletin-page">
        <div class="bulletin-border">
          
          <!-- Header -->
          <div class="header-table">
            <div class="header-left">
              MINISTERE DE L'ENSEIGNEMENT<br>
              PRE-UNIVERSITAIRE ET DE<br>
              L'ALPHABETISATION
            </div>
            <div class="header-center">
              ${logoBase64 ? `<img src="${logoBase64}">` : ''}
            </div>
            <div class="header-right">
              REPUBLIQUE DE GUINEE<br>
              <span style="font-size: 10px; font-weight: normal;">Travail-Justice-Solidarité</span><br>
              <div class="flag-line"></div>
            </div>
          </div>
          
          <!-- School & Title -->
          <div class="title-container">
            <h2 class="title-school">GROUPE SCOLAIRE DJOMA SAVOIR</h2>
            <div class="title-box">Bulletin de notes annuelles</div>
          </div>
          
          <!-- Meta Info -->
          <div class="meta-info">
            <div style="line-height: 1.4;">
              IRE : KINDIA<br>
              DPE : DUBREKA<br>
              DSEE : DUBREKA<br>
              ANNEE : 2026
            </div>
            <div style="line-height: 1.4; text-align: right;">
              Cycle : Collège<br>
              Classe : ${student.classe}
            </div>
          </div>
          
          <div class="separator"></div>
          
          <!-- Student Meta -->
          <div class="student-meta">
            <div>
              Prénom et Nom : <span style="font-weight: normal;">${student.prenom} ${student.nom}</span>
            </div>
            <div style="text-align: right; display: flex; gap: 20px;">
              <span>Matricule : <span style="font-weight: normal;">${student.matricule}</span></span>
              <span>Nombre d'élèves : <span style="font-weight: normal;">${totalStudents}</span></span>
            </div>
          </div>
          
          <!-- Table -->
          <table class="grades-table">
            <thead>
              <tr>
                <th style="width: 5%;">N°</th>
                <th style="width: ${subjWidth}%; text-align: left; padding-left: 6px;">Matières</th>
                <th style="width: 8%;">Coeff</th>
                ${headerColsHtml}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr style="font-weight: bold; background-color: #f9f9f9;">
                <td colspan="2" style="text-align: right; padding-right: 6px;">Total</td>
                <td>${totalCoeff}</td>
                ${totalsColsHtml}
              </tr>
            </tbody>
          </table>
          
          <!-- Summary Box -->
          <table class="summary-table">
            ${summaryRowsHtml}
            <tr style="background-color: #f3f3f3; font-size: 13px;">
              <td style="font-weight: bold; text-align: left; padding-left: 6px;">Moyenne annuelle</td>
              <td style="font-weight: bold; color: #0b5394; text-align: center;">${avgAnnual !== null ? avgAnnual.toFixed(2) + ' / 20' : '-'}</td>
            </tr>
            <tr>
              <td style="font-weight: bold; text-align: left; padding-left: 6px;">Rang de l'élève</td>
              <td style="font-weight: bold; color: #0b5394; text-align: center;">${formattedRank}</td>
            </tr>
            <tr>
              <td style="font-weight: bold; text-align: left; padding-left: 6px;">Appréciation</td>
              <td style="font-weight: bold; color: #0b5394; text-align: center;">${appreciation}</td>
            </tr>
          </table>
          
          <!-- Signatures -->
          <div class="signatures-box">
            <div style="text-align: center; width: 45%;">
              <span style="text-decoration: underline;">Le Censeur :</span>
              <br><br><br><br>
              M.DEMBA DIALLO
            </div>
            <div style="text-align: center; width: 45%;">
              <span style="text-decoration: underline;">Le Directeur Général :</span>
              <br><br><br><br>
              M.BABADY SOUMAH
            </div>
          </div>
          
        </div>
      </div>
    </body>
    </html>
  `;

  const tempHtmlPath = path.join(__dirname, 'temp_bulletin_student.html');
  fs.writeFileSync(tempHtmlPath, html);

  let tempWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false
    }
  });

  await tempWindow.loadURL(`file://${tempHtmlPath}`);

  const pdfData = await tempWindow.webContents.printToPDF({
    margins: {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0
    },
    pageSize: 'A4',
    printBackground: true
  });

  fs.writeFileSync(outputPath, pdfData);
  tempWindow.destroy();

  try {
    fs.unlinkSync(tempHtmlPath);
  } catch (e) {
    console.error('Error deleting temp HTML file:', e);
  }
}

async function generateMeritListPDF(level, outputPath) {
  const allStudents = await db.Eleve.findAll({
    where: { classe: level }
  });

  // Calculate results for each period dynamically
  const classNotesList = await db.Note.findAll({
    include: [{
      model: db.Eleve,
      as: 'eleve',
      where: { classe: level }
    }]
  });
  const uniquePeriods = Array.from(new Set(classNotesList.map(n => n.periode)));
  const periodOrder = { '1er': 1, '2ème': 2, '3ème': 3 };
  let periods = uniquePeriods.sort((a, b) => (periodOrder[a] || 99) - (periodOrder[b] || 99));
  if (periods.length === 0) {
    periods = ['1er', '2ème'];
  }

  const periodResults = {};
  for (const p of periods) {
    periodResults[p] = await calculator.calculateClassResults(level, p);
  }

  const studentAnnualData = [];
  for (const student of allStudents) {
    let sumAvgs = 0;
    let hasAnyAvg = false;
    periods.forEach(p => {
      const avg = periodResults[p].resultsMap[student.id]?.average;
      if (avg !== null && avg !== undefined) {
        sumAvgs += avg;
        hasAnyAvg = true;
      }
    });
    const avgAnnual = hasAnyAvg ? (sumAvgs / periods.length) : null;

    const dataObj = {
      studentId: student.id,
      student,
      avgAnnual
    };
    periods.forEach(p => {
      dataObj['avg' + p] = periodResults[p].resultsMap[student.id]?.average ?? null;
    });

    studentAnnualData.push(dataObj);
  }

  // Rank students annually by average descending
  const gradedAnnual = studentAnnualData.filter(s => s.avgAnnual !== null);
  const ungradedAnnual = studentAnnualData.filter(s => s.avgAnnual === null);
  gradedAnnual.sort((a, b) => b.avgAnnual - a.avgAnnual);

  gradedAnnual.forEach((student, index) => {
    if (index > 0 && student.avgAnnual === gradedAnnual[index - 1].avgAnnual) {
      student.rankAnnual = gradedAnnual[index - 1].rankAnnual;
    } else {
      student.rankAnnual = index + 1;
    }
  });

  ungradedAnnual.forEach(student => {
    student.rankAnnual = null;
  });

  const sortedStudents = [...gradedAnnual, ...ungradedAnnual];
  const logoBase64 = getLogoBase64();
  const scale = await calculator.getGradingScale();

  const colWidth = Math.floor(30 / periods.length);
  const nameWidth = 100 - 8 - 12 - 11 - 13 - (colWidth * periods.length);

  let headerColsHtml = '';
  periods.forEach(p => {
    headerColsHtml += `<th style="width: ${colWidth}%; border: 1px solid black; padding: 6px;">Moy. ${p} Sem</th>`;
  });

  let rowsHtml = '';
  sortedStudents.forEach(item => {
    const rankText = item.rankAnnual === null ? '-' : (item.rankAnnual === 1 ? '1er' : `${item.rankAnnual}ème`);
    const app = calculator.getAppreciation(item.avgAnnual, scale);
    
    let periodsAveragesHtml = '';
    periods.forEach(p => {
      const val = item['avg' + p];
      periodsAveragesHtml += `<td style="border: 1px solid black; padding: 6px;">${val !== null ? val.toFixed(2) : '-'}</td>`;
    });

    rowsHtml += `
      <tr>
        <td style="font-weight: bold; border: 1px solid black; padding: 6px;">${rankText}</td>
        <td style="border: 1px solid black; padding: 6px;">${item.student.matricule || '-'}</td>
        <td style="text-align: left; padding-left: 8px; font-weight: bold; border: 1px solid black; padding: 6px;">${item.student.prenom} ${item.student.nom}</td>
        ${periodsAveragesHtml}
        <td style="font-weight: bold; color: #0b5394; border: 1px solid black; padding: 6px;">${item.avgAnnual !== null ? item.avgAnnual.toFixed(2) + ' / 20' : '-'}</td>
        <td style="border: 1px solid black; padding: 6px;">${app}</td>
      </tr>
    `;
  });

  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page {
          size: A4 landscape;
          margin: 10mm;
        }
        body {
          margin: 0;
          padding: 0;
          font-family: 'Times New Roman', Times, serif;
          background: white;
          font-size: 12px;
        }
        .container {
          border: 1px solid black;
          padding: 15px;
          min-height: 185mm;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
        }
        .header-table {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 8px;
        }
        .header-left {
          width: 35%;
          text-align: left;
          font-size: 11px;
          line-height: 1.3;
          font-weight: bold;
        }
        .header-center {
          width: 30%;
          text-align: center;
        }
        .header-center img {
          height: 50px;
          object-fit: contain;
        }
        .header-right {
          width: 35%;
          text-align: right;
          font-size: 11px;
          line-height: 1.3;
          font-weight: bold;
        }
        .flag-line {
          width: 80px;
          height: 3px;
          background: linear-gradient(to right, #ce1126 33%, #fcd116 33%, #fcd116 66%, #009460 66%);
          margin-left: auto;
          margin-top: 4px;
        }
        .title-container {
          text-align: center;
          margin-bottom: 12px;
        }
        .title-school {
          font-size: 18px;
          margin: 0;
          font-weight: bold;
          text-transform: uppercase;
        }
        .title-box {
          display: inline-block;
          border: 1.5px solid black;
          border-radius: 6px;
          padding: 6px 20px;
          margin-top: 6px;
          font-weight: bold;
          font-size: 15px;
          text-transform: uppercase;
          background-color: #f3f3f3;
        }
        .meta-info {
          width: 100%;
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          font-weight: bold;
          margin-bottom: 8px;
        }
        .separator {
          border-top: 1.5px dashed black;
          margin-bottom: 12px;
          width: 100%;
        }
        .merit-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        .merit-table th {
          background-color: #0b5394;
          color: white;
          border: 1px solid black;
          padding: 6px;
          font-weight: bold;
          font-size: 11px;
        }
        .merit-table td {
          border: 1px solid black;
          padding: 5px;
          text-align: center;
          font-size: 11px;
        }
        .signatures-box {
          margin-top: auto;
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <!-- Header -->
        <div class="header-table">
          <div class="header-left">
            MINISTERE DE L'ENSEIGNEMENT<br>
            PRE-UNIVERSITAIRE ET DE<br>
            L'ALPHABETISATION
          </div>
          <div class="header-center">
            ${logoBase64 ? `<img src="${logoBase64}">` : ''}
          </div>
          <div class="header-right">
            REPUBLIQUE DE GUINEE<br>
            <span style="font-size: 10px; font-weight: normal;">Travail-Justice-Solidarité</span><br>
            <div class="flag-line"></div>
          </div>
        </div>
        
        <!-- Title -->
        <div class="title-container">
          <h2 class="title-school">GROUPE SCOLAIRE DJOMA SAVOIR</h2>
          <div class="title-box">PALMARÈS DE LA CLASSE PAR ORDRE DE MÉRITE</div>
        </div>
        
        <!-- Meta Info -->
        <div class="meta-info">
          <div>
            IRE : KINDIA | DPE : DUBREKA | DSEE : DUBREKA
          </div>
          <div style="text-align: right;">
            CYCLE : Collège | CLASSE : ${level} | ANNEE SCOLAIRE : 2025-2026
          </div>
        </div>
        
        <div class="separator"></div>
        
        <!-- Table -->
        <table class="merit-table">
          <thead>
            <tr>
              <th style="width: 8%; border: 1px solid black; padding: 6px;">Rang</th>
              <th style="width: 12%; border: 1px solid black; padding: 6px;">Matricule</th>
              <th style="width: ${nameWidth}%; text-align: left; padding-left: 8px; border: 1px solid black; padding: 6px;">Prénom & Nom</th>
              ${headerColsHtml}
              <th style="width: 11%; border: 1px solid black; padding: 6px;">Moy. Annuelle</th>
              <th style="width: 13%; border: 1px solid black; padding: 6px;">Appréciation</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        
        <!-- Signatures -->
        <div class="signatures-box">
          <div style="text-align: center; width: 45%;">
            <span style="text-decoration: underline;">Le Censeur :</span>
            <br><br><br><br>
            M.DEMBA DIALLO
          </div>
          <div style="text-align: center; width: 45%;">
            <span style="text-decoration: underline;">Le Directeur Général :</span>
            <br><br><br><br>
            M.BABADY SOUMAH
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const tempHtmlPath = path.join(__dirname, 'temp_merit_list.html');
  fs.writeFileSync(tempHtmlPath, html);

  let tempWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false
    }
  });

  await tempWindow.loadURL(`file://${tempHtmlPath}`);

  const pdfData = await tempWindow.webContents.printToPDF({
    margins: {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0
    },
    pageSize: 'A4',
    landscape: true,
    printBackground: true
  });

  fs.writeFileSync(outputPath, pdfData);
  tempWindow.destroy();

  try {
    fs.unlinkSync(tempHtmlPath);
  } catch (e) {
    console.error('Error deleting temp HTML file:', e);
  }
}

module.exports = {
  generateLevelPDF,
  generateStudentPDF,
  generateMeritListPDF
};
