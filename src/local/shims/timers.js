/** Node's `timers`: the same functions the phone has globally. */
module.exports = { setTimeout, clearTimeout, setInterval, clearInterval, setImmediate: globalThis.setImmediate ?? ((fn, ...a) => setTimeout(fn, 0, ...a)), clearImmediate: globalThis.clearImmediate ?? clearTimeout };
