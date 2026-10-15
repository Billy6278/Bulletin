'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Config extends Model {
    static associate(models) {
      // no associations needed for config
    }
  }
  Config.init({
    key: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false
    },
    value: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'Config',
    tableName: 'Configs'
  });
  return Config;
};
