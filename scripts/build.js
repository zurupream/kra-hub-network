/**
 * @file scripts/build.js
 * @description Validates all required Qlik Sense Extension deliverables and packages
 * `dist/kra-hub-network.zip` ready for import into Qlik Sense Enterprise (QMC) or Qlik Cloud.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const ZIP_PATH = path.join(DIST_DIR, 'kra-hub-network.zip');

const REQUIRED_FILES = [
  'kra-hub-network.qext',
  'kra-hub-network.js',
  'definition.js',
  'data-processor.js',
  'style.css',
  'lib/echarts.min.js'
];

function validateDeliverables() {
  console.log('Validating Qlik Sense Extension deliverables...');
  for (const relPath of REQUIRED_FILES) {
    const absPath = path.join(ROOT_DIR, relPath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Missing required deliverable file: ${relPath}`);
    }
    const stat = fs.statSync(absPath);
    if (stat.size === 0) {
      throw new Error(`Deliverable file is empty: ${relPath}`);
    }
    console.log(`  [OK] ${relPath} (${(stat.size / 1024).toFixed(1)} KB)`);
  }

  // Validate .qext JSON syntax
  const qext = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'kra-hub-network.qext'), 'utf8'));
  if (qext.type !== 'visualization' || !qext.name) {
    throw new Error('Invalid kra-hub-network.qext manifest');
  }
  console.log(`  [OK] Manifest verified: "${qext.name}" v${qext.version}`);
}

function buildZipArchive() {
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }
  if (fs.existsSync(ZIP_PATH)) {
    fs.unlinkSync(ZIP_PATH);
  }

  const pyScript = `
import zipfile, os
root = ${JSON.stringify(ROOT_DIR)}
out_zip = ${JSON.stringify(ZIP_PATH)}
files = ${JSON.stringify(REQUIRED_FILES)}
with zipfile.ZipFile(out_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
    for rel in files:
        zf.write(os.path.join(root, rel), arcname=rel)
`;
  execFileSync('python3', ['-c', pyScript], { stdio: 'inherit' });
  const zipStat = fs.statSync(ZIP_PATH);
  console.log(`\nSuccessfully built Qlik Sense Extension archive:`);
  console.log(`  -> ${ZIP_PATH} (${(zipStat.size / 1024).toFixed(1)} KB)`);
}

validateDeliverables();
buildZipArchive();
