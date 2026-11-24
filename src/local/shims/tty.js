/** Node's `tty`: the phone has no terminal (colorette, used by knex, asks at load). */
module.exports = { isatty: () => false };
