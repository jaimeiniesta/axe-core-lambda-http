const chromium = require('chrome-aws-lambda');
const puppeteer = require('puppeteer');
const axeCore = require('axe-core');
const { createServer } = require('http');
const { parse: parseURL } = require('url');

const { PORT = 3000 } = process.env;

const analyze = async url => {
  let browser;
  let results;

  try {
    // Setup Puppeteer
    browser = await puppeteer.launch({
      args: chromium.args,
      headless: chromium.headless,
      executablePath: await chromium.executablePath
    });

    // Get new page
    const page = await browser.newPage();
    await page.goto(url);

    // Inject and run axe-core
    const handle = await page.evaluateHandle(`
      // Inject axe source code
      ${axeCore.source}

      // Run axe
      axe.run()
    `);

    // Get the results from `axe.run()`.
    results = await handle.jsonValue();
    // Destroy the handle & return axe results.
    await handle.dispose();
  } catch (err) {
    // Ensure we close the puppeteer connection when possible
    if (browser) {
      await browser.close();
    }

    // Re-throw
    throw err;
  }

  await browser.close();
  return results;
};

const server = createServer((req, res) => {
  // Ensure ?url= was provided
  const { query = {} } = parseURL(req.url, true);
  const { url } = query;
  if (!url) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('URL required');
    return;
  }

  // Analyze the URL
  analyze(url)
    .then(results => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(results, null, 2));
    })
    .catch(err => {
      console.error('Runtime error', { error: err.message, stack: err.stack });
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(err.message || 'Unknown error');
    });
});

server.listen(PORT);
