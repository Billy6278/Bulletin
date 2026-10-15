'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Matiere extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      Matiere.hasMany(models.Note, { foreignKey: 'matiereId', as: 'notes', onDelete: 'CASCADE' });
    }
  }
  Matiere.init({
    nom: DataTypes.STRING,
    coefficient: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'Matiere',
  });
  return Matiere;
};