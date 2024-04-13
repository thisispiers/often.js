// Based on https://github.com/juliangarnier/anime MIT license
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global.often = factory());
}(this, (function () { 'use strict';

// Defaults

const defaultIntervalSettings = {
    autostart: true,
    callback: null,
    delay: 1000,
    limit: -1,
    runImmediately: false,
};

const defaultIntervalCallbacks = {
    onLimitReached: null,
    onProgress: null,
};

// Utils

function minMax(val, min, max) {
    return Math.min(Math.max(val, min), max);
}

function isObj(a) {
    return Object.prototype.toString.call(a).indexOf('Object') > -1;
}

function isFnc(a) {
    return typeof a === 'function';
}

function isUnd(a) {
    return typeof a === 'undefined';
}

// Objects

function cloneObject(o) {
    const clone = {};
    for (let p in o) clone[p] = o[p];
    return clone;
}

function replaceObjectProps(o1, o2) {
    const o = cloneObject(o1);
    for (let p in o1) o[p] = o2.hasOwnProperty(p) ? o2[p] : o1[p];
    return o;
}

function createNewInterval(name, callback, settings) {
    const interval = {
        name: name,
        settings: {},
    };
    if (isFnc(callback)) {
        const delay = settings
        settings = {
            callback: callback,
        };
        if (!isUnd(delay)) settings.delay = delay;
    } else {
        settings = isObj(callback) ? callback : {};
    }
    if (isUnd(settings.delay) && !isUnd(often.delayDefault)) settings.delay = often.delayDefault;
    if (Number.isFinite(settings.delay)) interval.delay = settings.delay;
    interval.settings = replaceObjectProps(defaultIntervalSettings, settings),
    interval.callbacks = replaceObjectProps(defaultIntervalCallbacks, settings);
    return interval;
}

// Core

let raf;
let visibilitychangeListening;

const engine = (() => {
    function start() {
        if (!raf && (!isDocumentHidden() || !often.suspendWhenDocumentHidden) && often.intervals.length > 0) {
            raf = requestAnimationFrame(step);
        }
        return raf;
    }
    function step(t) {
        let i = 0;
        often.intervals.forEach(interval => {
            if (interval.enabled) {
                interval.tick(t);
                i++;
            }
        });
        raf = i > 0 ? requestAnimationFrame(step) : undefined;
    }

    function handleVisibilityChange() {
        if (!often.suspendWhenDocumentHidden) return;

        if (isDocumentHidden()) {
            // suspend ticks
            raf = cancelAnimationFrame(raf);
        } else { // is back to active tab
            // first adjust animations to consider the time that ticks were suspended
            often.intervals.forEach(
                interval => interval._onDocumentVisibility()
            );
            raf = engine();
        }
    }
    if (typeof document !== 'undefined' && !visibilitychangeListening) {
        document.addEventListener('visibilitychange', handleVisibilityChange);
        visibilitychangeListening = true;
    }

    return start;
})();

function isDocumentHidden() {
    return !!document && document.hidden;
}

function interval(name, params, delay) {

    let startTime = 0, currentTime = 0, lastTime = 0, now = 0;

    let interval = createNewInterval(name, params, delay);

    let shouldRunImmediately = interval.settings.runImmediately;

    function resetTime() {
        startTime = 0;
        lastTime = currentTime;
        setCallback('delay');
    }

    function setCallback(cb) {
        const i = cloneObject(interval);
        if (cb === 'callback' && isFnc(interval.settings[cb])) interval.settings[cb](i);
        if (cb === 'delay' && isFnc(interval.settings[cb])) interval.delay = interval.settings[cb](i);
        if (isFnc(interval.callbacks[cb])) interval.callbacks[cb](i);
        if (isFnc(often[cb])) often[cb](i);
    }

    function countIteration() {
        interval.iteration++;
        if (interval.settings.limit >= 0 && interval.remaining && interval.remaining !== true) {
            interval.remaining--;
        }
        setCallback('delay');
    }

    function setIntervalProgress(engineTime, progress) {
        const delay = interval.delay;
        if (!isUnd(progress)) {
            engineTime = (progress / delay) * delay;
        } else {
            interval.progress = engineTime / delay;
            setCallback('onProgress');
        }
        currentTime = minMax(engineTime, 0, delay);
        if (currentTime >= delay) {
            run();
        }
    }

    function run() {
        lastTime = 0;
        interval.lastRunTime = currentTime;
        countIteration();
        if (interval.settings.limit >= 0 && !interval.remaining) {
            interval.enabled = false;
            setCallback('onLimitReached');
        } else {
            startTime = now;
        }
        if (interval.settings.limit !== 0) setCallback('callback');
    }

    interval.reset = function() {
        if (isUnd(interval.enabled)) interval.enabled = false;
        currentTime = 0;
        if (isUnd(interval.lastRunTime)) interval.lastRunTime = 0;
        interval.progress = 0;
        interval.iteration = 0;
        const limit = interval.settings.limit;
        interval.remaining = limit >= 0 ? limit : Infinity;
    }

    // internal method (for engine) to adjust animation timings before restoring engine ticks (rAF)
    interval._onDocumentVisibility = resetTime;

    interval.tick = function(t) {
        now = t;
        if (!startTime) startTime = now;
        setIntervalProgress(now + (lastTime - startTime));
    }

    interval.seek = function(progress) {
        setIntervalProgress(null, progress);
    }

    interval.enable = function(enable) {
        interval.enabled = enable;
        if (!enable) resetTime();
    }

    interval.start = function() {
        if (interval.enabled) return;
        interval.reset();
        interval.enabled = true;
        resetTime();
        often.engine = engine();

        if (shouldRunImmediately && interval.settings.limit !== 0) {
            run();
            shouldRunImmediately = false;
        }
    }

    interval.restart = function() {
        interval.reset();
        interval.start();
    }

    interval.reset();

    return interval;

}

// Global handler

function getIntervals(name) {
    return often.intervals.filter(interval => !name || interval.name === name);
}
function callIntervalMethod(name, method, args) {
    getIntervals(name).forEach(interval => interval[method].apply(null, args));
}

const often = {
    // options
    autostart: true,
    delayDefault: 1000,
    suspendWhenDocumentHidden: true,

    // callbacks
    callback: null,
    onLimitReached: null,

    engine: null,
    intervals: [],

    // methods
    create: function(name, params, delay) {
        const i = interval(name, params, delay);
        often.intervals.push(i);
        if (often.autostart && i.settings.autostart) {
            i.start();
        }
        return i;
    },
    getInterval: function(name) {
        return (getIntervals(name) || [])[0] || false;
    },
    destroy: function(name) {
        return often.intervals.some((interval, i) => {
            if (interval.name === name || !name) {
                interval[method].enable(false);
                delete often.intervals[i];
                if (name) return true;
            }
        });
    },
    enable: function(name, enable) {
        if (name === true || name === false) {
            enable = name;
            name = undefined;
        }
        callIntervalMethod(name, 'enable', [enable]);
    },
    start: function(name) {
        callIntervalMethod(name, 'start');
    },
    restart: function(name) {
        callIntervalMethod(name, 'restart');
    },
    setProgress: function(name, progress) {
        if (isUnd(progress)) {
            progress = name;
            name = undefined;
        }
        callIntervalMethod(name, 'seek', [progress]);
    },
};

return often;

})));
