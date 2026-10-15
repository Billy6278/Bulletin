'use strict';

// State management
let currentPanel = 'dashboard';
let currentLevel = '';
let currentPeriod = '';
let levels = [];
let periods = [];
let classResults = [];
let selectedStudentId = null;
let currentSettings = {
  schoolName: 'Collège & Lycée Djoma',
  schoolYear: 'Année Scolaire 2025-2026',
  schoolLogo: '',
  gradingScale: []
};
let subjects = [];

// DOM Elements
const sidebarItems = document.querySelectorAll('.nav-item');
const panels = document.querySelectorAll('.panel');
const globalFilters = document.getElementById('global-filters');
const filterLevel = document.getElementById('filter-level');
const filterPeriod = document.getElementById('filter-period');

// Dashboard Elements
const fileUploader = document.getElementById('file-uploader');
const importStatus = document.getElementById('import-status');
const statTotalStudents = document.getElementById('stat-total-students');
const statTotalLevels = document.getElementById('stat-total-levels');
const statLatestPeriod = document.getElementById('stat-latest-period');

// Notes Elements
const studentsTableBody = document.getElementById('students-table-body');
const searchStudentInput = document.getElementById('search-student');

// Overlay Elements
const gradesOverlay = document.getElementById('student-grades-overlay');
const btnCloseOverlay = document.getElementById('btn-close-overlay');
const btnCancelOverlay = document.getElementById('btn-cancel-overlay');
const btnSaveOverlay = document.getElementById('btn-save-overlay');
const overlayStudentName = document.getElementById('overlay-student-name');
const overlayStudentClass = document.getElementById('overlay-student-class');
const overlayStudentPeriod = document.getElementById('overlay-student-period');
const overlayGradesList = document.getElementById('overlay-grades-list');

// Settings Elements
const inputSchoolName = document.getElementById('input-school-name');
const inputSchoolYear = document.getElementById('input-school-year');
const btnUploadLogo = document.getElementById('btn-upload-logo');
const btnClearLogo = document.getElementById('btn-clear-logo');
const schoolLogoPreview = document.getElementById('school-logo-preview');
const btnSaveGeneralSettings = document.getElementById('btn-save-general-settings');
const scaleEditorContainer = document.getElementById('scale-editor-container');
const btnSaveScale = document.getElementById('btn-save-scale');
const subjectCoeffsTableBody = document.getElementById('subject-coeffs-table-body');
const btnSaveCoefficients = document.getElementById('btn-save-coefficients');

// Bulletin Elements
const selectBulletinStudent = document.getElementById('select-bulletin-student');
const btnExportExcel = document.getElementById('btn-export-excel');
const bulletinPreviewEmpty = document.getElementById('bulletin-preview-empty');
const bulletinSheetPreview = document.getElementById('bulletin-sheet-preview');
const previewSchoolName = document.getElementById('preview-school-name');
const previewSchoolYear = document.getElementById('preview-school-year');
const previewBulletinTitle = document.getElementById('preview-bulletin-title');
const previewStudentName = document.getElementById('preview-student-name');
const previewStudentClass = document.getElementById('preview-student-class');
const previewStudentMatricule = document.getElementById('preview-student-matricule');
const previewStudentEffectif = document.getElementById('preview-student-effectif');
const previewBulletinTbody = document.getElementById('preview-bulletin-tbody');
const previewTotalPoints = document.getElementById('preview-total-points');
const previewAverage = document.getElementById('preview-average');
const previewRank = document.getElementById('preview-rank');
const previewAppreciation = document.getElementById('preview-appreciation');
const previewLogoPlaceholder = document.getElementById('preview-logo-placeholder');

// Toast Element
const appToast = document.getElementById('app-toast');
const appToastMessage = document.getElementById('app-toast-message');

// Initialize Hidden Logo Input
const logoFileInput = document.createElement('input');
logoFileInput.type = 'file';
logoFileInput.accept = 'image/*';

// ==================== TOAST NOTIFICATIONS ====================
function showToast(message, type = 'success') {
  appToastMessage.textContent = message;
  appToast.className = `toast active ${type}`;
  
  setTimeout(() => {
    appToast.classList.remove('active');
  }, 4000);
}

// ==================== TABS NAVIGATION ====================
sidebarItems.forEach(item => {
  item.addEventListener('click', () => {
    sidebarItems.forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    
    const panelId = item.getAttribute('data-panel');
    currentPanel = panelId;
    
    panels.forEach(p => p.classList.remove('active'));
    document.getElementById(`panel-${panelId}`).classList.add('active');
    
    // Manage Global Filters Visibility
    if (panelId === 'notes' || panelId === 'bulletin') {
      globalFilters.style.display = 'flex';
      triggerDataFetch();
    } else {
      globalFilters.style.display = 'none';
    }
    
    if (panelId === 'config') {
      loadSettingsPanel();
    }
    
    if (panelId === 'dashboard') {
      loadDashboardStats();
    }
  });
});

// ==================== DATA LOADER HELPER ====================
async function triggerDataFetch() {
  currentLevel = filterLevel.value;
  currentPeriod = filterPeriod.value;
  
  if (!currentLevel || !currentPeriod) {
    if (currentPanel === 'notes') {
      studentsTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Veuillez sélectionner un niveau et une période pour charger la liste.</td></tr>`;
    } else if (currentPanel === 'bulletin') {
      bulletinPreviewEmpty.style.display = 'block';
      bulletinSheetPreview.style.display = 'none';
      selectBulletinStudent.innerHTML = `<option value="">Veuillez choisir un élève...</option>`;
    }
    return;
  }
  
  // Fetch class data
  const data = await window.api.getClassResults(currentLevel, currentPeriod);
  classResults = data.resultsList || [];
  
  if (currentPanel === 'notes') {
    renderStudentsTable();
  } else if (currentPanel === 'bulletin') {
    populateStudentsDropdown();
  }
}

// ==================== GLOBAL FILTERS INITIALIZATION ====================
async function loadFilters() {
  const { levels: loadedLevels, periods: loadedPeriods } = await window.api.getLevelsAndPeriods();
  levels = loadedLevels;
  periods = loadedPeriods;
  
  // Preserve selections if possible
  const prevLevel = filterLevel.value;
  const prevPeriod = filterPeriod.value;
  
  filterLevel.innerHTML = '<option value="">Sélectionnez un niveau</option>';
  levels.forEach(lvl => {
    const opt = document.createElement('option');
    opt.value = lvl;
    opt.textContent = lvl;
    if (lvl === prevLevel) opt.selected = true;
    filterLevel.appendChild(opt);
  });
  
  filterPeriod.innerHTML = '<option value="">Sélectionnez une période</option>';
  periods.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    if (p === prevPeriod) opt.selected = true;
    filterPeriod.appendChild(opt);
  });
  
  if (filterLevel.value && filterPeriod.value) {
    triggerDataFetch();
  }
}

filterLevel.addEventListener('change', triggerDataFetch);
filterPeriod.addEventListener('change', triggerDataFetch);

// ==================== DASHBOARD PANEL ====================
fileUploader.addEventListener('click', async () => {
  const filePath = await window.api.selectFile();
  if (!filePath) return;
  
  importStatus.style.color = 'var(--primary-light)';
  importStatus.textContent = 'Importation en cours... Veuillez patienter.';
  
  const result = await window.api.importExcel(filePath);
  
  if (result.success) {
    importStatus.style.color = 'var(--success)';
    importStatus.textContent = result.message;
    showToast('Importation réussie !');
    
    // Reload UI state
    await loadFilters();
    await loadDashboardStats();
  } else {
    importStatus.style.color = 'var(--danger)';
    importStatus.textContent = `Erreur : ${result.message}`;
    showToast(`Erreur d'importation : ${result.message}`, 'error');
  }
});

async function loadDashboardStats() {
  const { levels: loadedLevels, periods: loadedPeriods } = await window.api.getLevelsAndPeriods();
  
  // Calculate total students across all classes
  let totalSt = 0;
  for (const lvl of loadedLevels) {
    for (const p of loadedPeriods) {
      const data = await window.api.getClassResults(lvl, p);
      if (p === loadedPeriods[0]) {
        // Only add student counts once per level to avoid double counting across periods
        totalSt += data.resultsList.length;
      }
    }
  }
  
  statTotalStudents.textContent = totalSt;
  statTotalLevels.textContent = loadedLevels.length;
  statLatestPeriod.textContent = loadedPeriods[loadedPeriods.length - 1] || '-';
  
  // Toggle visibility of global export card
  const cardGlobalExport = document.getElementById('card-global-export');
  if (cardGlobalExport) {
    if (totalSt > 0) {
      cardGlobalExport.style.display = 'block';
    } else {
      cardGlobalExport.style.display = 'none';
    }
  }
}

// Global Export Event Listener
const btnExportAllBulletins = document.getElementById('btn-export-all-bulletins');
const globalExportProgressContainer = document.getElementById('global-export-progress-container');
const globalExportStatus = document.getElementById('global-export-status');
const globalExportPercentage = document.getElementById('global-export-percentage');
const globalExportProgressBar = document.getElementById('global-export-progress-bar');

if (btnExportAllBulletins) {
  btnExportAllBulletins.addEventListener('click', async () => {
    btnExportAllBulletins.disabled = true;
    globalExportProgressContainer.style.display = 'block';
    
    globalExportStatus.textContent = 'Préparation...';
    globalExportPercentage.textContent = '0%';
    globalExportProgressBar.style.width = '0%';
    
    const res = await window.api.exportAllBulletins();
    
    btnExportAllBulletins.disabled = false;
    globalExportProgressContainer.style.display = 'none';
    
    if (res && res.success) {
      showToast(res.message);
    } else {
      showToast(res.message || 'Erreur lors de l\'exportation globale.', 'error');
    }
  });
}

const btnExportAllMerits = document.getElementById('btn-export-all-merits');
if (btnExportAllMerits) {
  btnExportAllMerits.addEventListener('click', async () => {
    btnExportAllMerits.disabled = true;
    globalExportProgressContainer.style.display = 'block';
    
    globalExportStatus.textContent = 'Préparation...';
    globalExportPercentage.textContent = '0%';
    globalExportProgressBar.style.width = '0%';
    
    const res = await window.api.exportAllMerits();
    
    btnExportAllMerits.disabled = false;
    globalExportProgressContainer.style.display = 'none';
    
    if (res && res.success) {
      showToast(res.message);
    } else {
      showToast(res.message || 'Erreur lors de l\'exportation globale des palmarès.', 'error');
    }
  });
}

// Setup progress listener
window.api.onExportProgress((data) => {
  const percent = Math.round((data.current / data.total) * 100);
  if (globalExportStatus) globalExportStatus.textContent = data.status;
  if (globalExportPercentage) globalExportPercentage.textContent = `${percent}%`;
  if (globalExportProgressBar) globalExportProgressBar.style.width = `${percent}%`;
});

// ==================== NOTES PANEL ====================
function renderStudentsTable() {
  const query = searchStudentInput.value.toLowerCase().trim();
  const filtered = classResults.filter(s => s.fullName.toLowerCase().includes(query) || s.matricule.toLowerCase().includes(query));
  
  if (filtered.length === 0) {
    studentsTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Aucun élève trouvé.</td></tr>`;
    return;
  }
  
  studentsTableBody.innerHTML = '';
  filtered.forEach(student => {
    const row = document.createElement('tr');
    row.className = 'clickable';
    
    const formattedRank = student.rank === null ? '-' : (student.rank === 1 ? '1er' : `${student.rank}ème`);
    const formattedAvg = student.average === null ? '-' : `${student.average} / 20`;
    
    row.innerHTML = `
      <td>${student.rank !== null ? student.rank : '-'}</td>
      <td><strong>${student.matricule || '-'}</strong></td>
      <td>${student.fullName}</td>
      <td>${student.totalPoints !== null && student.average !== null ? student.totalPoints.toFixed(2) : '-'}</td>
      <td><strong>${formattedAvg}</strong></td>
      <td><span style="font-weight: 600; color: var(--primary);">${formattedRank}</span></td>
      <td>${student.appreciation}</td>
    `;
    
    row.addEventListener('click', () => openGradesOverlay(student.studentId));
    studentsTableBody.appendChild(row);
  });
}

searchStudentInput.addEventListener('input', renderStudentsTable);

// ==================== STUDENT GRADES OVERLAY ====================
async function openGradesOverlay(studentId) {
  selectedStudentId = studentId;
  
  const details = await window.api.getStudentDetails(studentId, currentLevel, currentPeriod);
  if (!details) return;
  
  overlayStudentName.textContent = `${details.student.prenom} ${details.student.nom}`;
  overlayStudentClass.textContent = currentLevel;
  overlayStudentPeriod.textContent = currentPeriod;
  
  overlayGradesList.innerHTML = '';
  
  details.grades.forEach(g => {
    const activeNote = g.grades[currentPeriod];
    
    const row = document.createElement('div');
    row.className = 'grade-entry-row';
    row.innerHTML = `
      <span class="subj-name">${g.matiereName} <small style="color: var(--text-muted)">(Coeff: ${g.coefficient})</small></span>
      <div class="input-wrapper">
        <input type="number" step="0.01" min="0" max="20" class="grade-input" data-matiere-id="${g.matiereId}" data-coeff="${g.coefficient}" value="${activeNote !== null && activeNote !== undefined ? activeNote : ''}">
        <span style="font-size: 12px; font-weight: 500; color: var(--text-muted);">/20</span>
      </div>
    `;
    
    // Add real-time calculation updating
    const input = row.querySelector('.grade-input');
    input.addEventListener('input', recalculateOverlayGrades);
    
    overlayGradesList.appendChild(row);
  });
  
  gradesOverlay.classList.add('active');
}

function recalculateOverlayGrades() {
  const inputs = overlayGradesList.querySelectorAll('.grade-input');
  let totalPoints = 0;
  let totalCoeff = 0;
  let hasNotes = false;
  
  inputs.forEach(input => {
    const val = input.value.trim();
    const coeff = parseFloat(input.getAttribute('data-coeff')) || 1;
    if (val !== '') {
      const grade = parseFloat(val);
      if (!isNaN(grade)) {
        totalPoints += grade * coeff;
        totalCoeff += coeff;
        hasNotes = true;
      }
    }
  });
  
  const avg = hasNotes && totalCoeff > 0 ? totalPoints / totalCoeff : null;
  
  // Format summary output inside badge
  const studentBadge = document.querySelector('.student-badge');
  let summaryEl = studentBadge.querySelector('.recalc-summary');
  if (!summaryEl) {
    summaryEl = document.createElement('div');
    summaryEl.className = 'recalc-summary';
    summaryEl.style.marginTop = '10px';
    summaryEl.style.paddingTop = '8px';
    summaryEl.style.borderTop = '1px solid var(--border)';
    summaryEl.style.fontSize = '13px';
    studentBadge.appendChild(summaryEl);
  }
  
  if (avg !== null) {
    // Find appreciation
    let app = 'Echec';
    const normalizedAvg = avg;
    if (normalizedAvg >= 18.0) app = 'Excellent';
    else if (normalizedAvg >= 16.0) app = 'Très bien';
    else if (normalizedAvg >= 14.0) app = 'Bien';
    else if (normalizedAvg >= 12.0) app = 'Assez bien';
    else if (normalizedAvg >= 10.0) app = 'Passable';
    
    summaryEl.innerHTML = `
      <p style="margin-bottom:0;"><span style="font-weight:700; color: var(--primary);">Nouveau Total :</span> ${totalPoints.toFixed(2)}</p>
      <p style="margin-bottom:0;"><span style="font-weight:700; color: var(--primary);">Nouvelle Moyenne :</span> ${avg.toFixed(2)} / 20</p>
      <p style="margin-bottom:0;"><span style="font-weight:700; color: var(--primary);">Nouvelle Appréciation :</span> ${app}</p>
    `;
  } else {
    summaryEl.innerHTML = `<p style="margin-bottom:0; color:var(--danger);">Saisissez au moins une note pour recalculer.</p>`;
  }
}

async function saveOverlayGrades() {
  const inputs = overlayGradesList.querySelectorAll('.grade-input');
  
  for (const input of inputs) {
    const matiereId = parseInt(input.getAttribute('data-matiere-id'));
    const val = input.value.trim();
    
    await window.api.updateGrade(selectedStudentId, matiereId, currentPeriod, val);
  }
  
  showToast('Notes enregistrées avec succès !');
  gradesOverlay.classList.remove('active');
  
  // Refresh data
  triggerDataFetch();
}

btnCloseOverlay.addEventListener('click', () => gradesOverlay.classList.remove('active'));
btnCancelOverlay.addEventListener('click', () => gradesOverlay.classList.remove('active'));
btnSaveOverlay.addEventListener('click', saveOverlayGrades);

// ==================== CONFIGURATION & SETTINGS PANEL ====================
async function loadSettingsPanel() {
  // 1. Get settings
  const settings = await window.api.getSettings();
  if (settings) {
    currentSettings = settings;
    inputSchoolName.value = settings.schoolName;
    inputSchoolYear.value = settings.schoolYear;
    
    if (settings.schoolLogo) {
      schoolLogoPreview.innerHTML = `<img src="${settings.schoolLogo}" style="width: 100%; height: 100%; object-fit: contain;">`;
      btnClearLogo.style.display = 'inline-flex';
    } else {
      schoolLogoPreview.innerHTML = `<span style="font-size: 10px; color: var(--text-muted);">Aucun</span>`;
      btnClearLogo.style.display = 'none';
    }
    
    renderScaleEditor(settings.gradingScale);
  }
  
  // 2. Get subject list
  const loadedSubjects = await window.api.getSubjects();
  subjects = loadedSubjects;
  renderSubjectsTable();
}

function renderScaleEditor(scale) {
  scaleEditorContainer.innerHTML = '';
  
  // Order scale by threshold min descending
  const sorted = [...scale].sort((a, b) => b.min - a.min);
  
  sorted.forEach((rule, idx) => {
    const row = document.createElement('div');
    row.className = 'scale-rule-row';
    row.innerHTML = `
      <span>Moyenne ≥</span>
      <div style="display: flex; gap: 8px; align-items: center;">
        <input type="number" step="0.1" class="scale-min" value="${rule.min}" style="width: 70px; text-align: center;">
        <input type="text" class="scale-label" value="${rule.label}" style="flex-grow: 1;">
      </div>
    `;
    scaleEditorContainer.appendChild(row);
  });
}

function renderSubjectsTable() {
  if (subjects.length === 0) {
    subjectCoeffsTableBody.innerHTML = `<tr><td colspan="2" style="text-align: center; color: var(--text-muted);">Aucune matière. Importez des données.</td></tr>`;
    return;
  }
  
  subjectCoeffsTableBody.innerHTML = '';
  subjects.forEach(subj => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>${subj.nom}</strong></td>
      <td style="text-align: center;">
        <input type="number" min="1" class="coeff-input" data-subj-id="${subj.id}" value="${subj.coefficient || 1}" style="width: 60px; padding: 4px; text-align: center; border-radius: 4px; border: 1px solid var(--border);">
      </td>
    `;
    subjectCoeffsTableBody.appendChild(row);
  });
}

// Logo upload triggering
btnUploadLogo.addEventListener('click', () => logoFileInput.click());

logoFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result;
    currentSettings.schoolLogo = base64;
    schoolLogoPreview.innerHTML = `<img src="${base64}" style="width: 100%; height: 100%; object-fit: contain;">`;
    btnClearLogo.style.display = 'inline-flex';
  };
  reader.readAsDataURL(file);
});

btnClearLogo.addEventListener('click', () => {
  currentSettings.schoolLogo = '';
  schoolLogoPreview.innerHTML = `<span style="font-size: 10px; color: var(--text-muted);">Aucun</span>`;
  btnClearLogo.style.display = 'none';
  logoFileInput.value = '';
});

// Save general settings
btnSaveGeneralSettings.addEventListener('click', async () => {
  const name = inputSchoolName.value.trim();
  const year = inputSchoolYear.value.trim();
  
  const res = await window.api.saveSettings({
    schoolName: name,
    schoolYear: year,
    schoolLogo: currentSettings.schoolLogo
  });
  
  if (res && res.success) {
    showToast('Paramètres de l\'établissement sauvegardés !');
  } else {
    showToast('Erreur lors de la sauvegarde.', 'error');
  }
});

// Save grading scale
btnSaveScale.addEventListener('click', async () => {
  const rows = scaleEditorContainer.querySelectorAll('.scale-rule-row');
  const scale = [];
  
  rows.forEach(row => {
    const minVal = parseFloat(row.querySelector('.scale-min').value);
    const labelVal = row.querySelector('.scale-label').value.trim();
    if (!isNaN(minVal) && labelVal) {
      scale.push({ min: minVal, label: labelVal });
    }
  });
  
  const res = await window.api.saveSettings({ gradingScale: scale });
  if (res && res.success) {
    showToast('Barème d\'appréciation sauvegardé !');
    currentSettings.gradingScale = scale;
  } else {
    showToast('Erreur lors de la sauvegarde.', 'error');
  }
});

// Save coefficients
btnSaveCoefficients.addEventListener('click', async () => {
  const inputs = subjectCoeffsTableBody.querySelectorAll('.coeff-input');
  const subjectCoeffs = [];
  
  inputs.forEach(input => {
    const id = parseInt(input.getAttribute('data-subj-id'));
    const coeff = parseInt(input.value) || 1;
    subjectCoeffs.push({ id, coefficient: coeff });
  });
  
  const res = await window.api.updateSubjectCoefficients(subjectCoeffs);
  if (res && res.success) {
    showToast('Coefficients mis à jour avec succès !');
    // Refresh coefficients locally
    loadSettingsPanel();
  } else {
    showToast('Erreur lors de la mise à jour.', 'error');
  }
});

// ==================== BULLETIN PREVIEW PANEL ====================
function populateStudentsDropdown() {
  // Populate students dropdown for bulletin selection
  const prevSelected = selectBulletinStudent.value;
  selectBulletinStudent.innerHTML = '<option value="">Veuillez choisir un élève...</option>';
  
  classResults.forEach(student => {
    const opt = document.createElement('option');
    opt.value = student.studentId;
    opt.textContent = `${student.fullName} (Moyenne: ${student.average !== null ? student.average.toFixed(2) : '-'})`;
    if (student.studentId.toString() === prevSelected) opt.selected = true;
    selectBulletinStudent.appendChild(opt);
  });
  
  // Auto-select first student if none selected
  if (!selectBulletinStudent.value && classResults.length > 0) {
    selectBulletinStudent.value = classResults[0].studentId;
  }
  
  if (selectBulletinStudent.value) {
    renderBulletinPreview();
  } else {
    bulletinPreviewEmpty.style.display = 'block';
    bulletinSheetPreview.style.display = 'none';
  }
}

selectBulletinStudent.addEventListener('change', renderBulletinPreview);

async function renderBulletinPreview() {
  const studentId = selectBulletinStudent.value;
  if (!studentId) {
    bulletinPreviewEmpty.style.display = 'block';
    bulletinSheetPreview.style.display = 'none';
    return;
  }
  
  // Load student detailed grades and computed summary
  const details = await window.api.getStudentDetails(studentId, currentLevel, currentPeriod);
  const settings = await window.api.getSettings();
  
  if (!details) {
    showToast('Impossible de charger le bulletin de l\'élève.', 'error');
    return;
  }
  
  bulletinPreviewEmpty.style.display = 'none';
  bulletinSheetPreview.style.display = 'flex';
  
  // Render Metadata
  previewSchoolName.textContent = settings.schoolName.toUpperCase();
  previewSchoolYear.textContent = settings.schoolYear;
  previewBulletinTitle.textContent = `BULLETIN SCOLAIRE - ${currentPeriod.toUpperCase()}`;
  
  previewStudentName.textContent = `${details.student.prenom} ${details.student.nom}`;
  previewStudentClass.textContent = currentLevel;
  previewStudentMatricule.textContent = details.student.matricule || '-';
  previewStudentEffectif.textContent = classResults.filter(s => s.average !== null).length;
  
  if (settings.schoolLogo) {
    previewLogoPlaceholder.innerHTML = `<img src="${settings.schoolLogo}">`;
  } else {
    previewLogoPlaceholder.innerHTML = '';
  }
  
  // Render Subjects Table
  previewBulletinTbody.innerHTML = '';
  let totalCoeff = 0;
  let totalWeighted = 0;
  let hasActiveGrades = false;
  
  details.grades.forEach((g, index) => {
    const row = document.createElement('tr');
    
    const activeNote = g.grades[currentPeriod];
    let weightedTotal = '-';
    if (activeNote !== null && activeNote !== undefined) {
      const coeff = g.coefficient || 1;
      weightedTotal = (activeNote * coeff).toFixed(2);
      totalWeighted += activeNote * coeff;
      totalCoeff += coeff;
      hasActiveGrades = true;
    }
    
    row.innerHTML = `
      <td>${index + 1}</td>
      <td class="subj-name">${g.matiereName}</td>
      <td>${g.coefficient}</td>
      <td>${g.grades['1er'] !== null && g.grades['1er'] !== undefined ? g.grades['1er'].toFixed(2) : '-'}</td>
      <td>${g.grades['2ème'] !== null && g.grades['2ème'] !== undefined ? g.grades['2ème'].toFixed(2) : '-'}</td>
      <td>${g.grades['3ème'] !== null && g.grades['3ème'] !== undefined ? g.grades['3ème'].toFixed(2) : '-'}</td>
      <td style="font-weight: 600; color: var(--primary);">${weightedTotal}</td>
    `;
    previewBulletinTbody.appendChild(row);
  });
  
  // Render Totals Row
  const totalRow = document.createElement('tr');
  totalRow.className = 'total-row';
  totalRow.innerHTML = `
    <td colspan="2" style="text-align: left;">TOTAL</td>
    <td>${hasActiveGrades ? totalCoeff : '-'}</td>
    <td colspan="3"></td>
    <td>${hasActiveGrades ? totalWeighted.toFixed(2) : '-'}</td>
  `;
  previewBulletinTbody.appendChild(totalRow);
  
  // Render Performance Summary Card
  const studentResult = details.summary;
  
  // Calculate average for each period
  let sumCoeffP1 = 0, sumGradeP1 = 0;
  let sumCoeffP2 = 0, sumGradeP2 = 0;
  let sumCoeffP3 = 0, sumGradeP3 = 0;
  
  details.grades.forEach(g => {
    const coeff = g.coefficient || 1;
    if (g.grades['1er'] !== null && g.grades['1er'] !== undefined) {
      sumGradeP1 += g.grades['1er'] * coeff;
      sumCoeffP1 += coeff;
    }
    if (g.grades['2ème'] !== null && g.grades['2ème'] !== undefined) {
      sumGradeP2 += g.grades['2ème'] * coeff;
      sumCoeffP2 += coeff;
    }
    if (g.grades['3ème'] !== null && g.grades['3ème'] !== undefined) {
      sumGradeP3 += g.grades['3ème'] * coeff;
      sumCoeffP3 += coeff;
    }
  });
  
  const avgP1 = sumCoeffP1 > 0 ? sumGradeP1 / sumCoeffP1 : null;
  const avgP2 = sumCoeffP2 > 0 ? sumGradeP2 / sumCoeffP2 : null;
  const avgP3 = sumCoeffP3 > 0 ? sumGradeP3 / sumCoeffP3 : null;
  
  const avgs = [avgP1, avgP2, avgP3].filter(a => a !== null);
  const avgAnnual = avgs.length > 0 ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
  
  const avgP1El = document.getElementById('preview-avg-p1');
  const avgP2El = document.getElementById('preview-avg-p2');
  const avgP3El = document.getElementById('preview-avg-p3');
  const avgAnnualEl = document.getElementById('preview-avg-annual');
  
  if (avgP1El) avgP1El.textContent = avgP1 !== null ? `${avgP1.toFixed(2)} / 20` : '-';
  if (avgP2El) avgP2El.textContent = avgP2 !== null ? `${avgP2.toFixed(2)} / 20` : '-';
  if (avgP3El) avgP3El.textContent = avgP3 !== null ? `${avgP3.toFixed(2)} / 20` : '-';
  if (avgAnnualEl) avgAnnualEl.textContent = avgAnnual !== null ? `${avgAnnual.toFixed(2)} / 20` : '-';
  
  const totalSt = classResults.filter(s => s.average !== null).length;
  const formattedRank = studentResult.rank === null ? '-' : (studentResult.rank === 1 ? `1er / ${totalSt} élèves` : `${studentResult.rank}ème / ${totalSt} élèves`);
  
  previewRank.textContent = formattedRank;
  previewAppreciation.textContent = studentResult.appreciation || '-';
}

// Export single report card to PDF
btnExportExcel.addEventListener('click', async () => {
  const studentId = selectBulletinStudent.value;
  if (!studentId) {
    showToast('Veuillez sélectionner un élève avant d\'exporter.', 'error');
    return;
  }
  
  btnExportExcel.disabled = true;
  btnExportExcel.textContent = 'Exportation...';
  
  const res = await window.api.exportReportCard(studentId, currentLevel, currentPeriod);
  
  btnExportExcel.disabled = false;
  btnExportExcel.innerHTML = `
    <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; stroke: #fff; fill: none; stroke-width: 2.5; margin-right: 4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    Exporter l'élève (PDF)
  `;
  
  if (res && res.success) {
    showToast(res.message);
  } else {
    showToast(res.message || 'Erreur lors de l\'exportation.', 'error');
  }
});

// Export all class bulletins to a single PDF
const btnExportClass = document.getElementById('btn-export-class');
btnExportClass.addEventListener('click', async () => {
  if (!currentLevel || !currentPeriod) {
    showToast('Veuillez sélectionner un niveau et une période.', 'error');
    return;
  }
  
  btnExportClass.disabled = true;
  btnExportClass.textContent = 'Exportation...';
  
  const res = await window.api.exportClassBulletins(currentLevel, currentPeriod);
  
  btnExportClass.disabled = false;
  btnExportClass.innerHTML = `
    <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; stroke: #fff; fill: none; stroke-width: 2.5; margin-right: 4px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
    Exporter la classe (PDF)
  `;
  
  if (res && res.success) {
    showToast(res.message);
  } else {
    showToast(res.message || 'Erreur lors de l\'exportation de la classe.', 'error');
  }
});

// Export merit list for selected class
const btnExportMerit = document.getElementById('btn-export-merit');
btnExportMerit.addEventListener('click', async () => {
  if (!currentLevel) {
    showToast('Veuillez sélectionner un niveau.', 'error');
    return;
  }
  
  btnExportMerit.disabled = true;
  btnExportMerit.textContent = 'Génération...';
  
  const res = await window.api.exportClassMeritList(currentLevel);
  
  btnExportMerit.disabled = false;
  btnExportMerit.innerHTML = `
    <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; stroke: #fff; fill: none; stroke-width: 2.5; margin-right: 4px;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
    Palmarès Mérite (PDF)
  `;
  
  if (res && res.success) {
    showToast(res.message);
  } else {
    showToast(res.message || 'Erreur lors de l\'exportation du palmarès.', 'error');
  }
});

// ==================== ADD STUDENT & ADD SUBJECT OVERLAYS ====================

// Elements
const btnAddStudentModal = document.getElementById('btn-add-student-modal');
const addStudentOverlay = document.getElementById('add-student-overlay');
const btnCloseStudentOverlay = document.getElementById('btn-close-student-overlay');
const btnCancelStudentOverlay = document.getElementById('btn-cancel-student-overlay');
const btnSaveStudentOverlay = document.getElementById('btn-save-student-overlay');
const inputNewStudentFirstname = document.getElementById('new-student-firstname');
const inputNewStudentLastname = document.getElementById('new-student-lastname');
const selectNewStudentClass = document.getElementById('new-student-class-select');
const inputNewStudentClassInput = document.getElementById('new-student-class-input');
const inputNewStudentMatricule = document.getElementById('new-student-matricule');

const btnAddSubjectModal = document.getElementById('btn-add-subject-modal');
const addSubjectOverlay = document.getElementById('add-subject-overlay');
const btnCloseSubjectOverlay = document.getElementById('btn-close-subject-overlay');
const btnCancelSubjectOverlay = document.getElementById('btn-cancel-subject-overlay');
const btnSaveSubjectOverlay = document.getElementById('btn-save-subject-overlay');
const inputNewSubjectName = document.getElementById('new-subject-name');
const inputNewSubjectCoeff = document.getElementById('new-subject-coeff');

// Open Add Student Modal
btnAddStudentModal.addEventListener('click', () => {
  // Populate existing levels dropdown
  selectNewStudentClass.innerHTML = '<option value="">-- Choisir une classe existante --</option>';
  levels.forEach(lvl => {
    const opt = document.createElement('option');
    opt.value = lvl;
    opt.textContent = lvl;
    selectNewStudentClass.appendChild(opt);
  });
  
  // Reset form
  inputNewStudentFirstname.value = '';
  inputNewStudentLastname.value = '';
  selectNewStudentClass.value = '';
  inputNewStudentClassInput.value = '';
  inputNewStudentMatricule.value = '';
  
  addStudentOverlay.classList.add('active');
});

// Close Student Modal
btnCloseStudentOverlay.addEventListener('click', () => addStudentOverlay.classList.remove('active'));
btnCancelStudentOverlay.addEventListener('click', () => addStudentOverlay.classList.remove('active'));

// Save Student
btnSaveStudentOverlay.addEventListener('click', async () => {
  const prenom = inputNewStudentFirstname.value.trim();
  const nom = inputNewStudentLastname.value.trim();
  const matricule = inputNewStudentMatricule.value.trim();
  
  let classe = selectNewStudentClass.value;
  if (!classe) {
    classe = inputNewStudentClassInput.value.trim();
  }
  
  if (!prenom || !nom) {
    showToast('Le prénom et le nom de l\'élève sont requis.', 'error');
    return;
  }
  
  if (!classe) {
    showToast('Veuillez sélectionner ou saisir une classe.', 'error');
    return;
  }
  
  btnSaveStudentOverlay.disabled = true;
  btnSaveStudentOverlay.textContent = 'Enregistrement...';
  
  const res = await window.api.addStudent({ prenom, nom, classe, matricule });
  
  btnSaveStudentOverlay.disabled = false;
  btnSaveStudentOverlay.textContent = 'Enregistrer';
  
  if (res && res.success) {
    showToast(res.message);
    addStudentOverlay.classList.remove('active');
    
    // Refresh filters to list the potentially new class
    await loadFilters();
    
    // Select the new class if it is not selected
    if (filterLevel.value !== classe) {
      filterLevel.value = classe;
    }
    
    // Trigger data refresh
    await triggerDataFetch();
    await loadDashboardStats();
  } else {
    showToast((res && res.message) || 'Erreur lors de la création de l\'élève.', 'error');
  }
});

// Open Add Subject Modal
btnAddSubjectModal.addEventListener('click', () => {
  inputNewSubjectName.value = '';
  inputNewSubjectCoeff.value = '1';
  addSubjectOverlay.classList.add('active');
});

// Close Subject Modal
btnCloseSubjectOverlay.addEventListener('click', () => addSubjectOverlay.classList.remove('active'));
btnCancelSubjectOverlay.addEventListener('click', () => addSubjectOverlay.classList.remove('active'));

// Save Subject
btnSaveSubjectOverlay.addEventListener('click', async () => {
  const nom = inputNewSubjectName.value.trim();
  const coefficient = parseInt(inputNewSubjectCoeff.value) || 1;
  
  if (!nom) {
    showToast('Le nom de la matière est requis.', 'error');
    return;
  }
  
  btnSaveSubjectOverlay.disabled = true;
  btnSaveSubjectOverlay.textContent = 'Enregistrement...';
  
  const res = await window.api.addSubject({ nom, coefficient });
  
  btnSaveSubjectOverlay.disabled = false;
  btnSaveSubjectOverlay.textContent = 'Enregistrer';
  
  if (res && res.success) {
    showToast(res.message);
    addSubjectOverlay.classList.remove('active');
    
    // Reload settings panel
    await loadSettingsPanel();
  } else {
    showToast((res && res.message) || 'Erreur lors de la création de la matière.', 'error');
  }
});

// ==================== APP INITIALIZATION ====================
window.addEventListener('DOMContentLoaded', async () => {
  // Load filters and dashboard stats initially
  await loadFilters();
  await loadDashboardStats();
});
