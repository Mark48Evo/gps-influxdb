import SystemGPS from '@mark48evo/system-gps';
import { InfluxDB, FieldType } from 'influx';
import amqplib from 'amqplib';
import Debug from 'debug';

const debug = Debug('gps:influxdb');

const config = {
  influxHost: process.env.INFLUXDB_HOST || 'localhost',
  influxDB: process.env.INFLUXDB_DB || 'mark48evo',
  host: process.env.RABBITMQ_HOST || 'amqp://localhost',
  redisURL: process.env.REDIS_URL || 'redis://127.0.0.1:6379/3',
};

const influx = new InfluxDB({
  host: config.influxHost,
  database: config.influxDB,
  schema: [
    {
      measurement: 'gps',
      fields: {
        numberOfSatellites: FieldType.INTEGER,
        latitude: FieldType.FLOAT,
        longitude: FieldType.FLOAT,
        heightEllipsoid: FieldType.FLOAT,
        heightSeaLevel: FieldType.FLOAT,
        speed: FieldType.FLOAT,
        velocityNorth: FieldType.FLOAT,
        velocityEast: FieldType.FLOAT,
        velocityDown: FieldType.FLOAT,
        headingOfMotion: FieldType.FLOAT,
        speedAccuracy: FieldType.FLOAT,
        headingAccuracy: FieldType.FLOAT,
        horizontalAccuracy: FieldType.FLOAT,
        verticalAccuracy: FieldType.FLOAT,
      },
      tags: [
        'fixType',
      ],
    },
  ],
});

async function main() {
  await influx.getDatabaseNames()
    .then(async (names) => {
      if (!names.includes(config.influxDB)) {
        debug(`Creating InfluxDB "${config.influxDB}" database`);

        await influx.createDatabase(config.influxDB);

        return Promise.resolve();
      }

      return Promise.resolve();
    });

  const connect = await amqplib.connect(config.host);
  const channel = await connect.createChannel();

  const systemGPS = await SystemGPS(channel);

  systemGPS.on('nav.pvt', (data) => {
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
      verticalAccuracy: packet.vAcc / 1000,
    };

    const tags = {
      fixType: packet.fixType.string,
    };

    influx.writePoints([
      {
        measurement: 'gps',
        tags,
        fields,
        timestamp: new Date(`${packet.year}-${packet.month}-${packet.day} ${packet.hour}:${packet.minute}:${packet.second}  UTC`),
      },
    ]).catch((err) => {
      console.error(`InfluxDB Error: "${err.message()}" "${err.stack}"`);
    });
  });
}

main();
