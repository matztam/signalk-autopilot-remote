const Gpio = require('onoff').Gpio;

receiveSignal = null;
data1 = null;
data2 = null;
data3 = null;
data4 = null;
buzzer = null;

buzzerState = 0;


INPUT_ADJUST_HEADING_PLUS_1 = 8;  //1000
INPUT_ADJUST_HEADING_PLUS_10 = 4; //0100
INPUT_ADJUST_HEADING_MINUS_1 = 2; //0010
INPUT_ADJUST_HEADING_MINUS_10 = 1;//0001
INPUT_ADJUST_HEADING_AGAINST_WIND = 7; //0111
INPUT_TACK_STARBOARD = 12;        //1100
INPUT_TACK_PORT = 3;              //0011
INPUT_STATE_AUTO = 10;            //1010
INPUT_STATE_WIND = 6;             //0110
INPUT_STATE_STANDBY = 9;          //1011
INPUT_STATE_ROUTE = 5;            //0101
INPUT_KEYLOCK = 14;               //1110


const COMMANDS = {
  [INPUT_ADJUST_HEADING_PLUS_1]: { "path": "steering.autopilot.actions.adjustHeading", "value": 1 },
  [INPUT_ADJUST_HEADING_PLUS_10]: { "path": "steering.autopilot.actions.adjustHeading", "value": 10 },
  [INPUT_ADJUST_HEADING_MINUS_1]: { "path": "steering.autopilot.actions.adjustHeading", "value": -1 },
  [INPUT_ADJUST_HEADING_MINUS_10]: { "path": "steering.autopilot.actions.adjustHeading", "value": -10 },
  [INPUT_ADJUST_HEADING_AGAINST_WIND]: { "path": "steering.autopilot.target.windAngleApparent", "value": 0 },
  [INPUT_TACK_STARBOARD]: { "path": "steering.autopilot.actions.tack", "value": "starboard" },
  [INPUT_TACK_PORT]: { "path": "steering.autopilot.actions.tack", "value": "port" },
  [INPUT_STATE_AUTO]: { "path": "steering.autopilot.state", "value": "auto" },
  [INPUT_STATE_WIND]: { "path": "steering.autopilot.state", "value": "wind" },
  [INPUT_STATE_STANDBY]: { "path": "steering.autopilot.state", "value": "standby" },
  [INPUT_STATE_ROUTE]: { "path": "steering.autopilot.state", "value": "route" },
};

const BEEP_PATTERNS = {
  SINGLE_BUTTON: [100],
  KEYLOCK_ENABLE: [150, 50, 150, 50, 150],
  KEYLOCK_DISABLE: [150, 50, 150],
  TACK: [1000],
  HEADING_AGAINST_WIND: [1000, 200, 1000],
  STARTUP: [50],
};


keyLock = false;
keyLockTimeout = null;
tackTimeout = null;
beepTimeout = null;
againstWindTimeout = null;


module.exports = function (app) {
  var plugin = {};

  plugin.id = 'signalk-autopilot-remote';
  plugin.name = 'Autopilot remote';
  plugin.description = 'Plugin for interfacing the Signal K autopilot remote';

  plugin.start = function (options, restartPlugin) {
    app.debug('Plugin started');

    if (!Object.keys(options).length === 0) {
      console.log("Please configure plugin")
      return;
    }

    keyLock = options.keyLockOnByDefault;

    data1 = new Gpio(options.data1Gpio, 'in', 'none');
    data2 = new Gpio(options.data2Gpio, 'in', 'none');
    data3 = new Gpio(options.data3Gpio, 'in', 'none');
    data4 = new Gpio(options.data4Gpio, 'in', 'none');

    buzzer = new Gpio(options.buzzerGpio, 'out');

    receiveSignal = new Gpio(options.receiveSignalGpio, 'in', 'rising', { debounceTimeout: 30 });

    receiveSignal.watch(plugin.inputCallback);

    //setTimeout(plugin.beep(BEEP_PATTERNS.STARTUP), 3000);
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
        default: 16,
      },
      data4Gpio: {
        type: 'number',
        title: 'Data input 4 gpio pin',
        default: 24,
      },
      receiveSignalGpio: {
        type: 'number',
        title: 'Receive signal gpio pin',
        default: 26,
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
      plugin.beep(BEEP_PATTERNS.KEYLOCK_ENABLE);
      return;
    }

    if (input == INPUT_TACK_PORT || input == INPUT_TACK_STARBOARD) {
      tackTimeout = setTimeout(plugin.tackCallback, 2000);
      return;
    }
    
    if(input == INPUT_ADJUST_HEADING_AGAINST_WIND){
		againstWindTimeout = setTimeout(plugin.adjustHeadingAgainstWindCallback, 2000);
		return;
	}

    plugin.beep(BEEP_PATTERNS.SINGLE_BUTTON);

    plugin.execCommand(input);
  }

  plugin.toggleKeyLockCallback = function () {
    let input = plugin.readInputs();

    if (input == 14) {
      keyLock ^= true;;
    }

    if (keyLock) {
      plugin.beep(BEEP_PATTERNS.KEYLOCK_ENABLE);
    } else {
      plugin.beep(BEEP_PATTERNS.KEYLOCK_DISABLE);
    }
  }

  plugin.tackCallback = function () {
    let input = plugin.readInputs();

    if (input == INPUT_TACK_PORT || input == INPUT_TACK_STARBOARD) {
      plugin.execCommand(input);
      plugin.beep(BEEP_PATTERNS.TACK);
    }
  }
  
  plugin.adjustHeadingAgainstWindCallback = function(){
    let input = plugin.readInputs();
    
    if (input == INPUT_ADJUST_HEADING_AGAINST_WIND) {
      plugin.execCommand(input);
      plugin.beep(BEEP_PATTERNS.HEADING_AGAINST_WIND);
    }
	  
  }

  plugin.execCommand = function (input) {
    app.debug(input);

    if (!COMMANDS[input]) {
      console.error('Invalid input detected');
      return;
    }

    app.debug(COMMANDS[input].path);
    app.debug(COMMANDS[input].value);

    app.putSelfPath(COMMANDS[input].path, COMMANDS[input].value);
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

  plugin.beep = function (inputPattern) {
    //copy array since it gets passed by reference
    pattern = inputPattern.slice();

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





