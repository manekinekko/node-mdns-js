
var debug = require('debug')('mdns:browser');

var util = require('util');
var EventEmitter = require('events').EventEmitter;


var dns = require('mdns-js-packet');
var DNSPacket = dns.DNSPacket;
var DNSRecord = dns.DNSRecord;
var ServiceType = require('./service_type').ServiceType;
var decoder = require('./decoder');
// var counter = 0;
var internal = {};

/**
 * Handles incoming UDP traffic.
 * @private
 */
internal.onMessage = function (packets, remote, connection) {
  debug('got packets from remote', remote);

  var data = decoder.decodePackets(packets);
  var isNew = false;

  function setNew(/*msg*/) {
    isNew = true;
    debug('new on %s, because %s',
      connection.networkInterface, util.format.apply(null, arguments));
  }

  function updateValue(src, dst, name) {
    if (JSON.stringify(dst[name]) !== JSON.stringify(src)) {
      setNew('updated host.%s', name);
      dst[name] = src;
    }
  }

  function addValue(src, dst, name) {
    if (typeof dst[name] === 'undefined') {
      setNew('added host.%s', name);
      dst[name] = src;
    }
  }

  if (data) {

    data.interfaceIndex = connection.interfaceIndex;
    data.networkInterface = connection.networkInterface;
    data.addresses.push(remote.address);
    if (!connection.services) {
      connection.services = {};
    }

    if (!connection.addresses) {
      connection.addresses = {};
    }


    if (typeof data.type !== 'undefined') {
      data.type.forEach(function (type) {
        var service;
        var serviceKey = type.toString();
        if (!connection.services.hasOwnProperty(serviceKey)) {
          setNew('new service - %s', serviceKey);
          service = connection.services[serviceKey] = {
            type: type, addresses: []
          };
        }
        else {
          service = connection.services[serviceKey];
        }

        data.addresses.forEach(function (adr) {
          if (service.addresses.indexOf(adr) === -1) {
            service.addresses.push(adr);
            setNew('new address');
          }

          var host;
          if (connection.addresses.hasOwnProperty(adr)) {
            host = connection.addresses[adr];
          }
          else {
            host = connection.addresses[adr] = {address: adr};
            setNew('new host');
          }
          addValue({}, host, serviceKey);
          updateValue(data.port, host[serviceKey], 'port');
          updateValue(data.host, host[serviceKey], 'host');
          updateValue(data.txt, host[serviceKey], 'txt');
        });
      });
    }


    /**
     * Update event
     * @event Browser#update
     * @type {object}
     * @property {string} networkInterface - name of network interface
     * @property {number} interfaceIndex
     */
    debug('isNew', isNew);
    if (isNew && data) {
      this.emit('update', data);
    }
  }
};

/**
 * mDNS Browser class
 * @class
 * @param {string|ServiceType} serviceType - The service type to browse for.
 * @fires Browser#update
 */
var Browser = module.exports = function (networking, serviceType) {
  if (!(this instanceof Browser)) { return new Browser(serviceType); }

  var notString = typeof serviceType !== 'string';
  var notType = !(serviceType instanceof ServiceType);
  if (notString && notType) {
    debug('serviceType type:', typeof serviceType);
    debug('serviceType is ServiceType:', serviceType instanceof ServiceType);
    debug('serviceType=', serviceType);
    throw new Error('argument must be instance of ServiceType or valid string');
  }
  this.serviceType = serviceType;
  var self = this;
  // var services = {};
  // var addresses = {};

  networking.addUsage(this, function () {
    self.emit('ready');
  });

  this.stop = function () {
    networking.removeUsage(this);
  };//--start

  networking.on('packets', internal.onMessage.bind(this));

  this.discover = function () {
    var packet = new DNSPacket();
    packet.question.push(new DNSRecord(
      serviceType.toString() + '.local',
      DNSRecord.Type.PTR, 1)
    );
    networking.send(packet);
  };

};//--Browser constructor

util.inherits(Browser, EventEmitter);

