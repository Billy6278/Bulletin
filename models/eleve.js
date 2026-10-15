'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Eleve extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      Eleve.hasMany(models.Note, { foreignKey: 'eleveId', as: 'notes', onDelete: 'CASCADE' });
    }
  }
  Eleve.init({
    matricule: DataTypes.STRING,
    prenom: DataTypes.STRING,
    nom: DataTypes.STRING,
    classe: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'Eleve',
  });
  return Eleve;
};