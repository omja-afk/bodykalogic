/* config.js — where the cloud lives.
 *
 * The anon key is a PUBLIC key. It is designed to sit in client-side code and is
 * safe to commit, but only because row-level security is switched on in the
 * database: the key identifies the project, not the person, and every query is
 * still checked against the signed-in user. The policies in `supabase/schema.sql`
 * are what make that true — without them this key would expose every row.
 *
 * The service_role key must NEVER appear here. It bypasses row-level security.
 *
 * Leave anonKey empty and the app simply runs without sync: everything works,
 * it just stays on this device.
 */
(function (global) {
  'use strict';

  global.AppConfig = {
    supabase: {
      url: 'https://dptouuhjswganghwvmfe.supabase.co',
      // Publishable key. Safe in the browser and safe in this repo precisely
      // because row-level security is on — see supabase/schema.sql. It names the
      // project, not the person; every query is still checked against auth.uid().
      anonKey: 'sb_publishable_V6VYO2rptAW7s05rxeSZ1w_yQ9UO46y'
    },
    table: 'tracker_state'
  };

  global.AppConfig.syncConfigured = function () {
    var c = global.AppConfig.supabase;
    return !!(c.url && c.anonKey);
  };

}(window));
