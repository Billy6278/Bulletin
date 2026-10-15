'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFile: () => ipcRenderer.invoke('select-file'),
  importExcel: (filePath) => ipcRenderer.invoke('import-excel', filePath),
  
  getLevelsAndPeriods: () => ipcRenderer.invoke('get-levels-periods'),
  getClassResults: (level, period) => ipcRenderer.invoke('get-class-results', level, period),
  getStudentDetails: (studentId, level, period) => ipcRenderer.invoke('get-student-details', studentId, level, period),
  
  updateGrade: (studentId, matiereId, period, noteValue) => ipcRenderer.invoke('update-grade', studentId, matiereId, period, noteValue),
  
  exportReportCard: (studentId, level, period) => ipcRenderer.invoke('export-report-card', studentId, level, period),
  
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  
  getSubjects: () => ipcRenderer.invoke('get-subjects'),
  updateSubjectCoefficients: (subjectCoeffs) => ipcRenderer.invoke('update-subject-coefficients', subjectCoeffs),
  
  addStudent: (data) => ipcRenderer.invoke('add-student', data),
  addSubject: (data) => ipcRenderer.invoke('add-subject', data),
  
  exportClassBulletins: (level, period) => ipcRenderer.invoke('export-class-bulletins', level, period),
  exportClassMeritList: (level) => ipcRenderer.invoke('export-class-merit-list', level),
  
  exportAllBulletins: () => ipcRenderer.invoke('export-all-bulletins'),
  exportAllMerits: () => ipcRenderer.invoke('export-all-merits'),
  onExportProgress: (callback) => ipcRenderer.on('export-progress', (event, data) => callback(data))
});
