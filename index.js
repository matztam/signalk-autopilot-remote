const Gpio = require('onoff').Gpio;

receiveSignal = null;
data1 = null;
data2 = null;
data3 = null;
data4 = null;
buzzer = null;

buzzerState = 0;


INPUT_ADJUST_HEADING_PLUS_1 = 1;
INPUT_ADJUST_HEADING_PLUS_10 = 2;
INPUT_ADJUST_HEADING_MINUS_1 = 4;
INPUT_ADJUST_HEADING_MINUS_10 = 8;
INPUT_TACK_STARBOARD = 3;
INPUT_TACK_PORT = 12;
INPUT_STATE_AUTO = 5;
INPUT_STATE_WIND = 6;
INPUT_STATE_STANDBY = 9;
INPUT_STATE_ROUTE = 10;
INPUT_KEYLOCK = 14;


const commands = {
  1: { "path": "steering.autopilot.actions.adjustHeading", "value": 1 },
  2: { "path": "steering.autopilot.actions.adjustHeading", "value": 10 },
  4: { "path": "steering.autopilot.actions.adjustHeading", "value": -1 },
  8: { "path": "steering.autopilot.actions.adjustHeading", "value": -10 },
  3: { "path": "steering.autopilot.actions.tack", "value": "starboard" },
  12: { "path": "steering.autopilot.actions.tack", "value": "port" },
  5: { "path": "steering.autopilot.state", "value": "auto" },
  6: { "path": "steering.autopilot.state", "value": "wind" },
  9: { "path": "steering.autopilot.state", "value": "standby" },
  10: { "path": "steering.autopilot.state", "value": "route" },
};


keyLock = false;
keyLockTimeout = null;
tackTimeout = null;
beepTimeout = null;


module.exports = function (app) {
  var plugin = {};

  plugin.id = 'signalk-autopilot-remote';
  plugin.name = 'Autopilot remote';
  plugin.description = 'Plugin for interfacing the Signal K autopilot remote';

  plugin.start = function (options, restartPlugin) {
    app.debug('Plugin started');
    
    if(!Object.keys(options).length === 0){
      console.log("Please configure plugin")
      return;
    }

    keyLock = options.keyLockOnByDefault;

    data1 = new Gpio(options.data1Gpio, 'in', 'none');
    data2 = new Gpio(options.data2Gpio, 'in', 'none');
    data3 = new Gpio(options.data3Gpio, 'in', 'none');
    data4 = new Gpio(options.data4Gpio, 'in', 'none');
    
    buzzer = new Gpio(options.buzzerGpio, 'out');

    receiveSignal = new Gpio(options.receiveSignalGpio, 'in', 'rising', { debounceTimeout: 50 });

    receiveSignal.watch(plugin.inputCallback);
  };

  plugin.stop = function () {
    app.debug('Plugin stopped');
    receiveSignal.unexport();
    data1.unexport();
    data2.unexport();
    data3.unexport();
    data4.unexport();
  };

  
  plugin.schema = {
    type: 'object',
    required: ['data1Gpio', 'data2Gpio', 'data3Gpio', 'data4Gpio', 'receiveSignalGpio'],
    properties: {
      keyLockOnByDefault: {
        type: 'boolean',
        title: 'Enable key lock at startup',
        default: false
      },
      data1Gpio: {
        type: 'number',
        title: 'Data input 1 gpio pin',
        default: 27,
      },
      data2Gpio: {
        type: 'number',
        title: 'Data input 2 gpio pin',
        default: 23,
      },
      data3Gpio: {
        type: 'number',
        title: 'Data input 3 gpio pin',
        default: 25,
      },
      data4Gpio: {
        type: 'number',
        title: 'Data input 4 gpio pin',
        default: 24,
      },
      receiveSignalGpio: {
        type: 'number',
        title: 'Receive signal gpio pin',
        default: 4,
      },
      buzzerGpio: {
        type: 'number',
        title: 'Buzzer gpio pin',
        default: 21,
      },
    }
  };

  plugin.inputCallback = function (error, value) {
    console.log('Input detected');
    if (error) {
      throw error;
    }

    clearTimeout(keyLockTimeout);
    clearTimeout(tackTimeout);

    let input = plugin.readInputs();

    if (input == INPUT_KEYLOCK) {
      keyLockTimeout = setTimeout(plugin.toggleKeyLockCallback, 1000);
      return;
    }

    if (keyLock) {
      console.log("Key lock is enabled");
      plugin.beep([500, 300, 500, 300, 500]);
      return;
    }

    if (input == INPUT_TACK_PORT || input == INPUT_TACK_STARBOARD) {
      tackTimeout = setTimeout(plugin.tackCallback, 1000);
      return;
    }

    plugin.beep([300]);

    plugin.execCommand(input);
  }

  plugin.toggleKeyLockCallback = function () {
    let input = plugin.readInputs();

    if (input == 14) {
      keyLock ^= true;;
    }

    if(keyLock){
      plugin.beep([500, 300, 500, 300, 500]);
    }else{
      plugin.beep([500, 300, 500]);
    }
  }

  plugin.tackCallback = function () {
    let input = plugin.readInputs();

    if (input == INPUT_TACK_PORT || input == INPUT_TACK_STARBOARD) {
      plugin.execCommand(input);
      plugin.beep([1000]);
    }
  }

  plugin.execCommand = function (input) {
    app.debug(input);

    if (!commands[input]) {
      console.error('Invalid input detected');
      return;
    }

    app.debug(commands[input].path);
    app.debug(commands[input].value);

    app.putSelfPath(commands[input].path, commands[input].value);
  }

  plugin.readInputs = function () {
    let input = 0;

    input |= data1.readSync() * 1;
    input |= data2.readSync() * 2;
    input |= data3.readSync() * 4;
    input |= data4.readSync() * 8;

    console.log(plugin.dec2bin(input));

    return input;
  }

  //plugin.beep([1000, 2000, 1000]);
  plugin.beep = function (pattern) {
    clearTimeout(beepTimeout);
    buzzerState ^= 1;

    timeout = pattern.shift();

    if (timeout == undefined) {
      buzzer.writeSync(0);
      buzzerState = 0;
      return;
    }

    buzzer.writeSync(buzzerState);

    beepTimeout = setTimeout(function () { plugin.beep(pattern) }, timeout);
  }

  plugin.dec2bin = function (dec) {
    return (dec >>> 0).toString(2);
  }

  return plugin;
};





