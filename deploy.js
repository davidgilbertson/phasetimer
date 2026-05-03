import {execSync} from "node:child_process";
import fs from "node:fs";

const version = Date.now();
const html = fs.readFileSync("index.html", "utf8")
    .replace(/(href="style\.css\?v=)[^"]+/, `$1${version}`)
    .replace(/(src="main\.js\?v=)[^"]+/, `$1${version}`);

fs.writeFileSync("index.html", html);
execSync("firebase deploy --only hosting", {stdio: "inherit"});
