// token colour-blind safe colours
const token_colours = [
  "rgba(86,180,233,0.13)",   
  "rgba(0,158,115,0.13)",    
  "rgba(230,159,0,0.14)",    
  "rgba(0,114,178,0.13)",    
  "rgba(213,94,0,0.13)",     
  "rgba(204,121,167,0.15)",  
  "rgba(100,143,255,0.13)", 
  "rgba(240,228,66,0.20)"   
];
const token_borders = [
  "#56B4E9", 
  "#009E73",  
  "#E69F00",  
  "#0072B2", 
  "#D55E00",  
  "#CC79A7",  
  "#648FFF",  
  "#b5a800"   
];

// active method set as BPE
let currentMethod = "bpe";

const CHAR_LIMIT = 3000;

const METHOD_LABELS = {
  bpe:           { name: "BPE",           full: "Byte Pair Encoding" },
  wordpiece:     { name: "WordPiece",     full: "BERT-style" },
  sentencepiece: { name: "SentencePiece", full: "Unigram-based" },
  word:          { name: "Word",          full: "Word-Level" },
  sentence:      { name: "Sentence",      full: "Sentence-Level" },
  char:          { name: "Char",          full: "Character-Level" },
};



//  Tokenisation Methods
function tokeniseChar(text) {
  return text.split("");
}

function tokeniseWord(text) {
  return text.match(/[^\s]+|\s+/g) || [];
}

function tokeniseSentencePiece(text) {
  if (!text) return [];
  const raw = text.match(/\s*[a-zA-Z']+|\s*[0-9]+|\s*[^\s]/g) || [];
  const tokens = [];
  for (const seg of raw) {
    const hasSpace = /^\s/.test(seg);
    const word = seg.trimStart();
    if (!word) continue;
    tokens.push(...spPieces(word, hasSpace));
  }
  return tokens;
}

function spPieces(word, leadingSpace) {
  const mark = leadingSpace ? "▁" : "";
  const suffixes = [
    "tion","sion","ment","ness","able","ible","ful","less",
    "ous","ive","ity","ing","ed","er","es","ly","al","ise","ize"
  ];
  if (word.length <= 3) return [mark + word];
  const lw = word.toLowerCase();
  let best = "";
  for (const s of suffixes) {
    if (lw.endsWith(s) && word.length > s.length + 1 && s.length > best.length) best = s;
  }
  if (best) {
    const stem = word.slice(0, word.length - best.length);
    return [mark + stem, best];
  }
  return [mark + word];
}

function tokeniseSentence(text) {
  // abbreviations that should not end a sentence
  const abbreviations = [
    "Mr", "Mrs", "Ms", "Dr", "Prof", "Sr", "Jr", "St", "e.g", "i.e", "vs"
  ];

  const sentences = [];
  let buffer = "";
  const tokens = text.split(/(\s+)/); // keep spaces so can reconstruct sentences

  for (let i = 0; i < tokens.length; i++) {
    buffer += tokens[i];

    // checks if the current buffer ends with a sentence ending punctuation
    const match = buffer.match(/([.!?])\s*$/);
    if (match) {
      // get word before punctuation
      const words = buffer.trim().split(/\s+/);
      const lastWord = words[words.length - 1].replace(/[.!?]+$/, "");

      if (!abbreviations.includes(lastWord)) {
        // real sentence boundary
        sentences.push(buffer.trim());
        buffer = "";
      }
    }
  }

  // insert any remaining text as a sentence
  if (buffer.trim().length > 0) {
    sentences.push(buffer.trim());
  }

  return sentences;
}



function tokeniseBPE(text) {
  const raw = text.match(/[a-zA-Z]+|[0-9]+|[^\sa-zA-Z0-9]|\s+/g) || [];
  const tokens = [];

  const commonWords = new Set([
    "the","a","an","is","are","was","were","be","been","being","have","has","had",
    "do","does","did","will","would","shall","should","may","might","can","could",
    "of","in","to","for","with","on","at","from","by","about","as","into","through",
    "during","before","after","above","below","between","out","off","over","under",
    "again","further","then","once","here","there","when","where","why","how","all",
    "each","every","both","few","more","most","other","some","such","no","nor","not",
    "only","own","same","so","than","too","very","and","but","or","if","while","that",
    "this","it","i","you","he","she","we","they","me","him","her","us","them","my",
    "your","his","its","our","their","what","which","who","whom","text","love","cats",
    "dog","house","time","day","way","year","people","world","life","hand","part",
    "new","old","good","great","high","small","large","long","big","little"
  ]);

  for (const segment of raw) {
    if (/^\s+$/.test(segment)) {
      tokens.push(segment);
    } else if (/^[^\sa-zA-Z0-9]$/.test(segment)) {
      tokens.push(segment);
    } else if (/^[0-9]+$/.test(segment)) {
      tokens.push(segment);
    } else if (commonWords.has(segment.toLowerCase()) && segment.length <= 6) {
      tokens.push(segment);
    } else {
      tokens.push(...subwordSplit(segment));
    }
  }
  return tokens;
}

function subwordSplit(word) {
  const prefixes = [
    "un","re","pre","dis","over","mis","out","sub",
    "inter","trans","super","anti","auto","semi"
  ];
  const suffixes = [
    "tion","sion","ment","ness","able","ible","ful","less",
    "ous","ive","ity","ing","ed","er","es","ly","al",
    "ise","ize","isation","ization","ating","ated"
  ];

  if (word.length <= 4) return [word];

  let remaining = word;
  const parts = [];

  const lw = remaining.toLowerCase();
  for (const p of prefixes) {
    if (lw.startsWith(p) && remaining.length > p.length + 2) {
      parts.push(remaining.slice(0, p.length));
      remaining = remaining.slice(p.length);
      break;
    }
  }

  const rlw = remaining.toLowerCase();
  let suffixFound = "";
  for (const s of suffixes) {
    if (rlw.endsWith(s) && remaining.length > s.length + 1) {
      if (s.length > suffixFound.length) suffixFound = s;
    }
  }

  if (suffixFound) {
    const stem = remaining.slice(0, remaining.length - suffixFound.length);
    const suf = remaining.slice(remaining.length - suffixFound.length);
    if (stem.length > 0) parts.push(stem);
    parts.push(suf);
  } else {
    parts.push(remaining);
  }

  return parts;
}

function tokeniseWordPiece(text) {
  const raw = text.match(/[a-zA-Z]+|[0-9]+|[^\sa-zA-Z0-9]|\s+/g) || [];
  const tokens = [];

  const vocab = new Set([
    "the","a","an","is","are","was","were","be","have","has","had","do","does",
    "did","will","would","can","could","of","in","to","for","with","on","at",
    "from","by","and","but","or","not","this","that","it","i","you","he","she",
    "we","they","text","token","model"
  ]);

  for (const segment of raw) {
    if (/^\s+$/.test(segment)) {
      tokens.push(segment);
    } else if (/^[^\sa-zA-Z0-9]$/.test(segment)) {
      tokens.push(segment);
    } else if (/^[0-9]+$/.test(segment)) {
      tokens.push(segment);
    } else if (vocab.has(segment.toLowerCase())) {
      tokens.push(segment);
    } else {
      tokens.push(...wordPieceSplit(segment));
    }
  }
  return tokens;
}

function wordPieceSplit(word) {
  if (word.length <= 3) return [word];

  const pieces = [];
  let i = 0;

  while (i < word.length) {
    let end = Math.min(i + 6, word.length);
    let found = false;

    for (let len = end - i; len >= 2; len--) {
      const chunk = word.slice(i, i + len);
      if (isKnownSubword(chunk.toLowerCase())) {
        pieces.push(i === 0 ? chunk : "##" + chunk);
        i += len;
        found = true;
        break;
      }
    }

    if (!found) {
      const take = Math.min(3, word.length - i);
      pieces.push(i === 0 ? word.slice(i, i + take) : "##" + word.slice(i, i + take));
      i += take;
    }
  }
  return pieces;
}



// cheks if string is a known subword fragment
function isKnownSubword(s) {
  const known = new Set([
    "un","re","pre","dis","over","ing","tion","sion","ment","ness",
    "able","ible","ful","less","ous","ive","ity","ed","er","es","ly",
    "al","ise","ize","ation","ating","ated","believ","fascin","amaz",
    "token","is","at","ion","isation","ization"
  ]);
  return known.has(s);
}

function tokenise(text, method) {
  switch (method) {
    case "char":          return tokeniseChar(text);
    case "word":          return tokeniseWord(text);
    case "sentencepiece": return tokeniseSentencePiece(text);
    case "wordpiece": return tokeniseWordPiece(text);
    case "sentence":  return tokeniseSentence(text);
    case "bpe":
    default:          return tokeniseBPE(text);
  }
}


//  UI

function switchMethod(method) {
  currentMethod = method;
  const label = METHOD_LABELS[method];
  const nameEl = document.getElementById("method-dropdown-name");
  const fullEl = document.getElementById("method-dropdown-full");
  if (nameEl) nameEl.textContent = label.name;
  if (fullEl) fullEl.textContent = label.full;
  document.querySelectorAll(".method-option").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.method === method);
  });
  document.getElementById("method-dropdown")?.classList.remove("open");
  updateTokenDisplay();
}


// Clears the textarea and output
function clearInput() {
  document.getElementById("tokenInput").value = "";
  updateTokenDisplay();
}


// reads the textarea and tokenises with the current method

function updateTokenDisplay() {
  const text = document.getElementById("tokenInput").value;

  // Char counter
  const counter = document.getElementById("char-counter");
  if (counter) {
    counter.textContent = text.length > 0 ? text.length + " / " + CHAR_LIMIT : "";
    counter.className = "char-counter" + (text.length > CHAR_LIMIT * 0.5 ? " char-counter--warn" : "");
  }

  // close detail panel when text changes
  const detailPanel = document.getElementById("token-detail");
  if (detailPanel) detailPanel.hidden = true;

  const tokens = tokenise(text, currentMethod);
  const output = document.getElementById("tokenOutput");

  output.innerHTML = "";
  let colourIdx = 0;
  let posIdx = 0;

  tokens.forEach((tok, i) => {
    if (/^\s+$/.test(tok)) {
      const span = document.createElement("span");
      span.className = "token";
      span.style.background = "rgba(0,0,0,0.03)";
      span.style.border = "1px solid #e5e3df";
      span.style.color = "#bbb";
      span.textContent = tok === " " ? "▁" : tok === "\n" ? "↵" : "⇥";
      span.title = "whitespace";
      span.style.animationDelay = i * 0.03 + "s";
      output.appendChild(span);
    } else {
      const ci = colourIdx % token_colours.length;
      const capturedPos = posIdx;
      const capturedCi = ci;
      const span = document.createElement("span");
      span.className = "token";
      span.style.background = token_colours[ci];
      span.style.border = `1px solid ${token_borders[ci]}40`;
      span.style.animationDelay = i * 0.03 + "s";
      span.style.cursor = "pointer";

      const textEl = document.createElement("span");
      textEl.textContent = tok;
      span.appendChild(textEl);

      const id = document.createElement("span");
      id.className = "token-id";
      id.textContent = hashToken(tok);
      span.appendChild(id);

      span.title = "Click for details";
      span.addEventListener("click", () => {
        if (span.classList.contains("token--active")) {
          span.classList.remove("token--active");
          document.getElementById("token-detail").hidden = true;
        } else {
          document.querySelectorAll(".token--active").forEach(s => s.classList.remove("token--active"));
          span.classList.add("token--active");
          showTokenDetail(tok, capturedPos, capturedCi);
        }
      });
      output.appendChild(span);
      colourIdx++;
      posIdx++;
    }
  });

  const allTokens = tokens.filter((t) => !/^\s+$/.test(t));
  const chars = text.length;
  const unique = new Set(allTokens).size;
  const ratio = allTokens.length > 0 ? (chars / allTokens.length).toFixed(1) : "0";

  document.getElementById("statTokens").textContent = allTokens.length;
  document.getElementById("statChars").textContent = chars;
  document.getElementById("statRatio").textContent = ratio;
  document.getElementById("statVocab").textContent = unique;
}


function showTokenDetail(tok, pos, ci) {
  const bytes = new TextEncoder().encode(tok).length;
  const chip = document.getElementById("td-chip");
  chip.textContent = tok;
  chip.style.background = token_colours[ci];
  chip.style.border = "1px solid " + token_borders[ci] + "40";
  document.getElementById("td-id").textContent = hashToken(tok);
  document.getElementById("td-pos").textContent = "#" + (pos + 1);
  document.getElementById("td-bytes").textContent = bytes + (bytes === 1 ? " byte" : " bytes");
  document.getElementById("token-detail").hidden = false;
}


// ID for a token
function hashToken(tok) {
  let hash = 0;
  for (let i = 0; i < tok.length; i++) {
    hash = ((hash << 5) - hash + tok.charCodeAt(i)) | 0;
  }
  return Math.abs(hash % 50257);
}


// Init 
const _tokenInput = document.getElementById("tokenInput");
if (_tokenInput) {
  _tokenInput.addEventListener("input", updateTokenDisplay);
  updateTokenDisplay();
}

document.getElementById("token-detail-close")?.addEventListener("click", () => {
  document.querySelectorAll(".token--active").forEach(s => s.classList.remove("token--active"));
  document.getElementById("token-detail").hidden = true;
});

// Dropdown
document.getElementById("method-dropdown-btn")?.addEventListener("click", e => {
  document.getElementById("method-dropdown").classList.toggle("open");
  e.stopPropagation();
});
document.addEventListener("click", () => {
  document.getElementById("method-dropdown")?.classList.remove("open");
});
document.querySelectorAll(".method-option").forEach(btn => {
  btn.addEventListener("click", () => switchMethod(btn.dataset.method));
});

// sample text presets
document.querySelectorAll(".lang-presets .lang-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".lang-btn").forEach(b => b.classList.remove("active-lang"));
    btn.classList.add("active-lang");
    document.getElementById("tokenInput").value = btn.dataset.text;
    updateTokenDisplay();
  });
});

// copy button
document.getElementById("copy-btn")?.addEventListener("click", () => {
  const text = document.getElementById("tokenInput").value;
  const tokens = tokenise(text, currentMethod).filter(t => !/^\s+$/.test(t));
  navigator.clipboard.writeText(tokens.join(" ")).then(() => {
    const btn = document.getElementById("copy-btn");
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = "Copy"; }, 1500);
  });
});

const _logoLink = document.querySelector('a.logo');
if (_logoLink) {
  _logoLink.addEventListener('click', e => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}