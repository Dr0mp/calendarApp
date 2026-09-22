# Calendar audit tools
Re-run the metrics from the audits after each phase of the fix plan.

    cd audit-tools && npm install
    node css-report.js  <path-to-Calendar>   # writes css-report.txt  (dup selectors, overrides, tokens, !important, unused classes)
    node html-js-report.js <path>            # writes hj-report.txt   (undefined classes, orphan ids, inline styles, colors in JS)
    node methods-report.js <path>            # unreferenced class methods, largest methods
    node dead-css.js <path>                  # fully-dead CSS rules + line count
    node i18n.mjs <path>                     # unused / missing i18n keys
    npx jscpd <path> --min-lines 8 --min-tokens 60 --ignore "**/node_modules/**"

Note: `html-js-report.js` / `methods-report.js` assume a single `app.js`. After the module split (Phase 5), concatenate modules first:
`cat app.js src/**/*.js > /tmp/app-all.js` or update the scripts to glob.
