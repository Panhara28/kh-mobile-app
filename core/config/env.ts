// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
type MailServerConfig = {
  FROM_EMAIL: string;
  HOST: string;
  USERNAME: string;
  PASSWORD: string;
};

export const env = {
  public: {
    mainDatabase: process.env.DB_MAIN,
    mailServer: process.env.MAIL_SERVER
      ? (JSON.parse(process.env.MAIL_SERVER) as MailServerConfig)
      : ({} as MailServerConfig),
  },
};
