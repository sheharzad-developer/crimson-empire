const fs = require('fs');
const path = require('path');
const { hasValidAccess } = require('./_lib/access-token');

const HTML_PATH = path.join(__dirname, '..', 'crimson-empire.html');

const PAID_TAIL_START = '<div class="slide chapter-slide" id="ch2"';
const BOOK_END_MARK = '</div><!-- /.book -->';
const TOC_LIST_OPEN = '<ol id="tocList">';
const TOC_LIST_CLOSE = '</ol>';
const ORIGINAL_ROMAN_ARRAY =
  "const romanByIndex = ['·', '·', '·', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII', 'XXIV', '·'];";
const LOCKED_ROMAN_ARRAY = "const romanByIndex = ['·', '·', '·', 'I', '·'];";

const LOCKED_SLIDE = `
    <!-- LOCKED -->
    <div class="slide cover" id="coming-soon" data-title="Unlock the rest of the book">
      <div class="cover-inner">
        <p class="kicker">Chapter One was free</p>
        <h1 class="title" style="font-size:clamp(1.6rem, 5.5vw, 2.6rem);">Unlock the rest of Crimson Empire</h1>
        <p class="subtitle">Rs. 199 &mdash; Chapters Two through Twenty-Four</p>
        <p class="byline"><a href="/paywall.html" style="color:var(--gold); text-decoration:underline;">Continue reading &rarr;</a></p>
      </div>
    </div>

  `;

const LOCKED_TOC_TAIL =
  '      <li><a href="#coming-soon"><span class="num">&#128274;</span><span>Unlock the rest &mdash; Rs. 199</span></a></li>\n    ';

function buildLockedHtml(fullHtml) {
  const tocOpenIdx = fullHtml.indexOf(TOC_LIST_OPEN);
  const tocCloseIdx = fullHtml.indexOf(TOC_LIST_CLOSE, tocOpenIdx);
  const ch2Idx = fullHtml.indexOf(PAID_TAIL_START);
  const bookEndIdx = fullHtml.indexOf(BOOK_END_MARK);

  if (tocOpenIdx === -1 || tocCloseIdx === -1 || ch2Idx === -1 || bookEndIdx === -1) {
    // Structure changed underneath us — fail safe by serving the paywall-only message
    // rather than accidentally leaking paid chapters.
    return null;
  }

  const beforeToc = fullHtml.slice(0, tocOpenIdx + TOC_LIST_OPEN.length);
  const tocInner = fullHtml.slice(tocOpenIdx + TOC_LIST_OPEN.length, tocCloseIdx);
  const tocKeep = tocInner.split('\n').filter((line) => {
    return (
      line.includes('href="#cover"') ||
      line.includes('href="#prologue"') ||
      line.includes('href="#ch1"')
    );
  });
  const patchedToc = beforeToc + '\n' + tocKeep.join('\n') + '\n' + LOCKED_TOC_TAIL;

  // Rebuild: [patched head+TOC] + [rest of head after </ol> up to ch2, i.e. cover/title-page/prologue/ch1]
  //          + [locked slide] + [everything from </div><!-- /.book --> onward, with romanByIndex patched]
  const headAfterToc = fullHtml.slice(tocCloseIdx + TOC_LIST_CLOSE.length, ch2Idx);
  const footer = fullHtml.slice(bookEndIdx).replace(ORIGINAL_ROMAN_ARRAY, LOCKED_ROMAN_ARRAY);

  return patchedToc + TOC_LIST_CLOSE + headAfterToc + LOCKED_SLIDE + footer;
}

let cachedFull = null;
let cachedLocked = null;

function getVariants() {
  if (cachedFull === null) {
    cachedFull = fs.readFileSync(HTML_PATH, 'utf8');
    cachedLocked = buildLockedHtml(cachedFull) || cachedFull;
  }
  return { full: cachedFull, locked: cachedLocked };
}

module.exports = (req, res) => {
  const { full, locked } = getVariants();
  const authorized = hasValidAccess(req);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(authorized ? full : locked);
};
