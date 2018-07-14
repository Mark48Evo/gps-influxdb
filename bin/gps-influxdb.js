#!/usr/bin/env node
'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var SystemGPS = _interopDefault(require('@mark48evo/system-gps'));
var influx = require('influx');
var amqplib = _interopDefault(require('amqplib'));
var Debug = _interopDefault(require('debug'));
var pmx = _interopDefault(require('pmx'));

const debug = Debug('gps:influxdb');
pmx.init({});
const messagesProcessed = pmx.probe().counter({
  name: 'GPS Messages Processed'
});
const messagesProcessedPerMin = pmx.probe().meter({
  name: 'msg/min',
  samples: 1,
  timeframe: 60
});
const config = {
  influxHost: process.env.INFLUXDB_HOST || 'localhost',
  influxDB: process.env.INFLUXDB_DB || 'mark48evo',
  host: process.env.RABBITMQ_HOST || 'amqp://localhost'
};
const influx$1 = new influx.InfluxDB({
  host: config.influxHost,
  database: config.influxDB,
  schema: [{
    measurement: 'gps',
    fields: {
      numberOfSatellites: influx.FieldType.INTEGER,
      latitude: influx.FieldType.FLOAT,
      longitude: influx.FieldType.FLOAT,
      heightEllipsoid: influx.FieldType.FLOAT,
      heightSeaLevel: influx.FieldType.FLOAT,
      speed: influx.FieldType.FLOAT,
      velocityNorth: influx.FieldType.FLOAT,
      velocityEast: influx.FieldType.FLOAT,
      velocityDown: influx.FieldType.FLOAT,
      headingOfMotion: influx.FieldType.FLOAT,
      speedAccuracy: influx.FieldType.FLOAT,
      headingAccuracy: influx.FieldType.FLOAT,
      horizontalAccuracy: influx.FieldType.FLOAT,
      verticalAccuracy: influx.FieldType.FLOAT
    },
    tags: ['fixType']
  }]
});

async function main() {
  await influx$1.getDatabaseNames().then(async names => {
    if (!names.includes(config.influxDB)) {
      debug(`Creating InfluxDB "${config.influxDB}" database`);
      await influx$1.createDatabase(config.influxDB);
      return Promise.resolve();
    }

    return Promise.resolve();
  });
  const connect = await amqplib.connect(config.host);
  const channel = await connect.createChannel();
  const systemGPS = await SystemGPS(channel);
  systemGPS.on('nav.pvt', data => {
    messagesProcessed.inc();
    messagesProcessedPerMin.mark();
    const packet = data.data;
    const fields = {
      numberOfSatellites: packet.numSV,
      latitude: packet.lat,
      longitude: packet.lon,
      heightEllipsoid: packet.height / 1000,
      heightSeaLevel: packet.hMSL / 1000,
      speed: packet.gSpeed * 0.0036,
      velocityNorth: packet.velN * 0.0036,
      velocityEast: packet.velE * 0.0036,
      velocityDown: packet.velD * 0.0036,
      headingOfMotion: packet.headMot,
      speedAccuracy: packet.sAcc * 0.0036,
      headingAccuracy: packet.headAcc,
      horizontalAccuracy: packet.hAcc / 1000,
      verticalAccuracy: packet.vAcc / 1000
    };
    const tags = {
      fixType: packet.fixType.string
    };
    influx$1.writePoints([{
      measurement: 'gps',
      tags,
      fields,
      timestamp: new Date(`${packet.year}-${packet.month}-${packet.day} ${packet.hour}:${packet.minute}:${packet.second}  UTC`)
    }]).catch(err => {
      console.error(`InfluxDB Error: "${err.message()}" "${err.stack}"`);
    });
  });
}

main();
//# sourceMappingURL=gps-influxdb.js.map
