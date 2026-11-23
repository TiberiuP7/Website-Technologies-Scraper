Website Technologies Scraper

I approached the project with my first concern to understand the problem very well, because strong solutions come from investigation of the problem and the data behind it before writing code. The actual problem to solve was building a webste technilogies scrapper that correctly identifies technologies used in building a website, 
and trying to gather as much technologies and possible, thus making a balance between execution speed and accuracy of the findings. Proof is also very important for each findings, I collected evidence to support it, which contains among others it's type and the page on the website where it was found, it's source, value and the pattern it was matched to from the rules.

I chose to use the Node.js library, as I think it fits better this type of project, it gives much more speed, scalability and also because Node.js has native tools and libraries that can be used in projects for web scrapping, for example.
Therefore, I chose to use a technology that is more suited for this approach and supports the solution, rather than using a technology and try to shape the solution around the tool instead of the problem.
Only on pages from the same site. On pages from different sites, browsers block JavaScript on one site from reading responses from another unless that server allows it with CORS headers, and most don't. That's why scrapers run in Node.js, which has no such rule. I decided to use browser JavaScript for testing selectors in the DevTools console, not for collecting data.

The rule behind this is the same-origin policy. A script loaded from one origin can send a request to another, but the browser hides the response unless the other server opts in with Access-Control-Allow-Origin headers. MDN's CORS guide explains the details.

Node.js isn't a browser, so it reads any response it receives. That makes it the right place for a scraper, and it keeps credentials such as API keys off visitors' machines. Browser extensions and bookmarklets are the one exception: they can read the page you're already viewing, which suits one-off copying but not scheduled collection.

Node.js handles many network requests at once without threads, ships fetch built in, and runs the leading browser automation tools, Playwright and Puppeteer. Cheerio parses HTML quickly with familiar CSS selectors. It's a strong fit when your team already writes JavaScript or the scraper runs inside a Node.js service.

The solution works correctly, covers all the use cases and operates at big speeds, as it takes aproximatively 6 and a half minutes to finish scrapping the whole list of 200 websites from the domains.parquet file we received.
Respects the requirements precisely from input requirements, to output requirements and the structure of the output and findings.

I decided to organize the project into modules, for a more light-weight code and for a better and more clear structure of the code, and gave each module it's clear and predetermined tasks, so each one has it's own responsability and as such we can respect the Single Responsability Principle.
They comunicate through contracts and each module is configured to give a very specific structured output for the data to be used. The job runner, the orchestrator module si Main, in main.js, which gets the http requests and the Playwright one if it s neccessary, then
sends it further away to Match component, which takes the art or the site built in main with the help of helper functions and detects what technologies appear in that site, by receiving the compiled rules and the site object, which is also a very structured output from Main, that is sent to Match.
Match then return another structured output back to Main, with the final results, all the domains, with their attributes, url, finalUrl, array of Evidence objects for each technology found.
Then Main writes the data to the JSON file results.JSON and the workflow ends there.

The most relevant cases of the problem I found were, after we fetch the data from a http GET request and save it, we needed to also check if that data is complete, because some sites such as SPA's(Single Page Applications) tend to load a short or simple html file at runtime, and then dinamically load the JavaScript or other resources which would give away the technologies used in building that websit. In this case, running a headless browser in Chrome using Playwright is the solution, but a solutions that isn't feasible to use for each domain we need to scrap, because it takes many CPU resources and is heavy, aproximatively 150-300 MB for one chromium window for one site. Running the Playwright on each domain would possibly give better results but the delay in time and resources is too big to consider, and so I needed to find a solution, a middle ground, which would be the sweet spot as cost-effective and as technologies retrieved and found.
And as such, I built a workflow that first loads the rules that map patterns to technologies found in websites, then loaded the domains, compiled those rules so they could be used precisely in runtime in comparing and then fetched in all cases the http GET request, and only after check if it s the case for Playwright too, if the html, stripped of script tags that are most likely bot CAPTCHA's or scripts, is still shorter than 500 chracters, as that is a strong giveaway of a site that's not fully loaded. Also, if on the fetch we get errors such as 403, 429, 503. These errors give away that that site is a SPA. 

Here are the diagrams and the workflow I designed for this project.
![Detectarea tehnologiilor unui website.jpg](Detectarea%20tehnologiilor%20unui%20website.jpg)

![Web Technologies Scrapper Structure.jpg](Web%20Technologies%20Scrapper%20Structure.jpg)

![Componentele aplicatiei.jpg](Componentele%20aplicatiei.jpg)

How it works: 

For each domain the tool fetches the homepage and two inner pages (shop, cart, contact and blog-style pages first), robots.txt, the DNS records and the certificate issuer. Then it opens the homepage in Chromium as UserAgent and records every script and request the page makes, the HTML after JavaScript ran, and the JS globals the rules ask about. Detection then matches all of it against all of the 7,716 fingerprints.

There are two app tiers, and I measured whether the browser tier is worth it. I found out that it is well worth it, the app found 310 technologies without it, 429 with it (38% increase). So the default mode is --browser all; auto exists for runs where the browser is too expensive.
The focus is on evidence, proof over guesses or not 100% confidence. Every detection keeps what matched, where, and with which rule. Confidence follows Wappalyzer's rules: each pattern adds its own confidence, capped at 100, and the same rule matching on two pages counts once. Implies, requires and excludes are applied after matching, and implied technologies are linked and each one says what implied it.
For having a balance between speed, CPU load and most of the technologies found, I decided to choose 3 pages from each site, starting with the homepage of course and preferring shop, cart, contact and blog-style pages afterwards, because that is where third-party code tends to load. A full crawl costs much more and mostly finds the same scripts again.

The result is also a structured format, an Object with many attributes, which range from domain, finalUrl, possible errors, and an array of technologies found, with category, evidence for each technology and confidence.
This structured object is written in main in a results.JSON file, where for each domain there is an object that says which technologies does that domain use and other information, using the JSON.stringify method. There is also a count at the end which counts for each found technology how many times did it appear in those website that were crawled.
summary.json file lists every detected technology and on how many domains it appears”.

Challenges:
Websites detect web scrapers by analyzing request characteristics, behavioral patterns, and digital fingerprints that distinguish automated tools from human browsers. Detection systems examine IP addresses, HTTP headers, TLS handshake details, browser fingerprints, and user behavior including mouse movements and request timing. When suspicious patterns emerge like high request volumes, missing interaction signals, or inconsistent browser characteristics, the system flags the traffic as automated and responds with rate limiting, CAPTCHA challenges, or blocking.

For avoiding the risk of being blocked, slow down, send an honest user agent, retry 429 and 503 responses after the Retry-After delay, and cache pages so you don't fetch them twice. If a site still returns 403 errors or challenge pages, route the requests through a scraper API that manages proxies and rendering, and keep your Cheerio parser unchanged.

Anti-bot protection - CAPTCHA = for avoiding anti-bot protection you can use an UserAgent in the browser headers.
Read the site's terms and robots.txt before you crawl, keep request rates low, identify your scraper with an honest user agent, and collect only the fields you need. Avoid personal data unless you have a lawful basis, never scrape behind a login without permission, and use the site's official API when one exists.

Most of that is already in the code. robots.js checks the rules before the first page. The one-second delay and the two-worker cap keep your load small. The User-Agent header names your scraper and gives the site a way to reach you. And the parser keeps only the fields you need, typed and clean, instead of storing whole pages.

The rest is judgment. Public pages aren't a free-for-all: terms of service, copyright, and privacy law still apply, especially to personal data. 

Backend technologies are inaccesible, they can only be guesses by implied technologies.

False-positives from too large RegEx's.

Scripts that load only after the cookies consent - solution: automate the click on the banner(usually in the bottom left corner of the website's page).

Expired domains, redirects. Ideally, here are configured so that no domain is visited twice and so each redirect or a site that redirects to the main site isn't crawled again, because it is just a redirect to the main site, same with expired domains, they can't be crawled even though some info could be found on them.

For scalability browser only where the html is empty or the signals are very weak.

Saving artifacts as raw data so once they are checked they remain saved. This could be implemented in S3 or Parquet, with the detection as a separate runner job. 

Split the tiers. HTTP workers handle every domain; browser workers run in their own pool because they cost far more CPU and memory. A queue (SQS or Kafka) sits between them, workers are stateless and scale on queue length, and auto mode keeps the browser for domains that need it if cost becomes the limit.
Store the raw data. About 165 KB per domain compressed, roughly 1.7 TB for 10 million domains, in object storage (S3), with the queryable fields in Parquet.
Detection as a separate batch job. Because detection is a pure function, it can run over all stored data whenever the rules change, without crawling again.
Be polite and observable. Rate limits per host and per IP, retries with backoff, a DNS cache, one crawl per final host when several domains redirect to the same site, and metrics per failure reason (DNS, TLS, timeout, blocked) and per tier, so it is clear where coverage is lost.
Recrawl incrementally. Revisit domains that change often more frequently than static ones.


For identifying new technologies in the future

Across the whole corpus, I would count the script domains, add unexplained cookies, x- headers, meta generator values and JS globals (compared against a blank page). The ones that appear on many domains are the candidates.
The frequent ones become candidates, which you label manually or with an LLM and turn into new rules.
Also keep track of the Shopify App Store and updates to the Wappalyzer forks.

many domains are the candidates.
Turn candidates into rules. Identify the vendor behind each frequent candidate, by hand or with an LLM reading the script URL and code, write a rule in rules/custom.json, re-run with --from-raw and diff the results.
Watch external sources. The Shopify App Store (new apps show up as new extension handles, and for this company that includes competing analytics apps), upstream fingerprint updates (npm run rules), and new packages on npm and jsDelivr.