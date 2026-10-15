'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Note extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      Note.belongsTo(models.Eleve, { foreignKey: 'eleveId', as: 'eleve' });
      Note.belongsTo(models.Matiere, { foreignKey: 'matiereId', as: 'matiere' });
    }
  }
  Note.init({
    eleveId: DataTypes.INTEGER,
    matiereId: DataTypes.INTEGER,
    note: DataTypes.FLOAT,
    periode: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'Note',
  });
  return Note;
};