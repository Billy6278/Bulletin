'use strict';

const db = require('../models');

/**
 * Gets the grading scale from database config or returns default.
 */
async function getGradingScale() {
  try {
    const config = await db.Config.findOne({ where: { key: 'grading_scale' } });
    if (config && config.value) {
      return JSON.parse(config.value);
    }
  } catch (err) {
    console.error('Error fetching grading scale:', err);
  }
  
  // Default scale
  return [
    { min: 18.0, label: 'Excellent' },
    { min: 16.0, label: 'Très bien' },
    { min: 14.0, label: 'Bien' },
    { min: 12.0, label: 'Assez bien' },
    { min: 10.0, label: 'Passable' },
    { min: 0.0, label: 'Echec' }
  ];
}

/**
 * Gets appreciation based on average and scale.
 */
function getAppreciation(average, scale) {
  if (average === null || average === undefined || isNaN(average)) {
    return 'Non classé';
  }
  
  // Scale out of 10 to out of 20
  const normalizedAverage = average;
  
  if (scale && Array.isArray(scale)) {
    const sorted = [...scale].sort((a, b) => b.min - a.min);
    for (const s of sorted) {
      if (normalizedAverage >= s.min) {
        return s.label;
      }
    }
  }
  
  if (normalizedAverage >= 18.0) return 'Excellent';
  if (normalizedAverage >= 16.0) return 'Très bien';
  if (normalizedAverage >= 14.0) return 'Bien';
  if (normalizedAverage >= 12.0) return 'Assez bien';
  if (normalizedAverage >= 10.0) return 'Passable';
  return 'Echec';
}

/**
 * Calculates totals, averages, ranks, and appreciations for all students in a class (level) and period.
 */
async function calculateClassResults(level, period) {
  // 1. Fetch all students in this level
  const students = await db.Eleve.findAll({
    where: { classe: level },
    include: [{
      model: db.Note,
      as: 'notes',
      include: [{ model: db.Matiere, as: 'matiere' }]
    }]
  });
  
  if (students.length === 0) {
    return { resultsList: [], resultsMap: {}, totalStudents: 0 };
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
  const classMatieres = Array.from(classMatiereMap.values());
  
  let totalClassCoeff = 0;
  const matiereCoeffMap = {};
  classMatieres.forEach(m => {
    const coeff = m.coefficient || 1;
    matiereCoeffMap[m.id] = coeff;
    totalClassCoeff += coeff;
  });
  
  // 3. Get grading scale
  const scale = await getGradingScale();
  
  // 4. Compute total, average for each student
  const studentResults = students.map(student => {
    // Filter notes for the selected period
    const periodNotes = student.notes.filter(n => n.periode === period);
    
    // Check if the student has any notes for this period
    const hasGrades = periodNotes.some(n => n.note !== null && n.note !== undefined);
    
    let totalPoints = 0;
    const gradesDetail = {};
    
    // Create a map of the student's notes for fast lookup
    const studentNotesMap = {};
    periodNotes.forEach(n => {
      studentNotesMap[n.matiereId] = n;
    });
    
    // Loop over all subjects taught in this class
    classMatieres.forEach(m => {
      const n = studentNotesMap[m.id];
      const coeff = m.coefficient || 1;
      const noteVal = (n && n.note !== null && n.note !== undefined) ? n.note : 0;
      
      totalPoints += noteVal * coeff;
      
      if (n && n.note !== null && n.note !== undefined) {
        gradesDetail[m.id] = {
          note: n.note,
          coefficient: coeff,
          total: n.note * coeff,
          matiereName: m.nom
        };
      } else {
        gradesDetail[m.id] = {
          note: null,
          coefficient: coeff,
          total: 0,
          matiereName: m.nom
        };
      }
    });
    
    const average = hasGrades && totalClassCoeff > 0 ? (totalPoints / totalClassCoeff) : null;
    
    return {
      studentId: student.id,
      matricule: student.matricule,
      prenom: student.prenom,
      nom: student.nom,
      fullName: `${student.prenom} ${student.nom}`.trim(),
      classe: student.classe,
      totalPoints: hasGrades ? totalPoints : 0,
      totalCoeff: hasGrades ? totalClassCoeff : 0,
      average: average !== null ? parseFloat(average.toFixed(2)) : null,
      gradesDetail,
      hasGrades
    };
  });
  
  // 5. Rank students who have grades
  const gradedStudents = studentResults.filter(s => s.hasGrades && s.average !== null);
  const ungradedStudents = studentResults.filter(s => !s.hasGrades || s.average === null);
  
  // Sort graded by average descending
  gradedStudents.sort((a, b) => b.average - a.average);
  
  // Assign ranks (competition rank: 1, 2, 2, 4)
  gradedStudents.forEach((student, index) => {
    if (index > 0 && student.average === gradedStudents[index - 1].average) {
      student.rank = gradedStudents[index - 1].rank;
    } else {
      student.rank = index + 1;
    }
    student.appreciation = getAppreciation(student.average, scale);
  });
  
  // Ungraded students get no rank
  ungradedStudents.forEach(student => {
    student.rank = null;
    student.appreciation = 'Non classé';
  });
  
  // Combine lists
  const allResults = [...gradedStudents, ...ungradedStudents];
  
  // Map back to an object for fast lookup by student ID
  const resultMap = {};
  allResults.forEach(r => {
    resultMap[r.studentId] = r;
  });
  
  return {
    resultsList: allResults,
    resultsMap: resultMap,
    totalStudents: gradedStudents.length
  };
}

module.exports = {
  getGradingScale,
  getAppreciation,
  calculateClassResults
};
