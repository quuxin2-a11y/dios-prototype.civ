/*
 * In-app pages: every outside link (records, sources, credits, news, Wikipedia) opens as one of the app's own
 * screens. The page is fetched, its article is found and rebuilt from plain text, headings, lists, tables and
 * pictures in the app's own cards and colours. No website is ever shown and nothing opens another browser.
 *
 * Safety: nothing from the page is inserted as HTML. rdBuild walks the article and creates fresh elements from a
 * short allow-list, copying only text, https picture addresses and link addresses; scripts, styles, forms and
 * frames never reach the screen.
 */
var RD = { stack: [], seq: 0 };
var RD_DROP =
  "script,style,noscript,template,iframe,object,embed,form,input,button,select,textarea,svg,canvas,nav,header,footer,aside,dialog,[aria-hidden=true],[hidden]";
var RD_JUNK =
  /(^|[\s_-])(nav|navbar|menu|sidebar|footer|masthead|cookie|consent|banner|share|social|comment|promo|advert|ads?|related|subscribe|newsletter|breadcrumbs?|toolbar|popup|modal|skip|mw-editsection|reference|reflist|navbox|infobox_v3|metadata)([\s_-]|$)/i;

function rdWebUrl(u) {
  return /^https?:\/\//i.test(String(u || ""));
}

function rdSameApp(u) {
  try {
    return new URL(u, location.href).origin === location.origin;
  } catch (x) {
    return false;
  }
}

function rdHost(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch (x) {
    return "";
  }
}

// Wikipedia articles come from Wikipedia's own clean article service instead of the full web page.
function rdSource(u) {
  var m = /^https?:\/\/([a-z-]+)\.(?:m\.)?wikipedia\.org\/wiki\/([^?#]+)/i.exec(u);
  return m ? "https://" + m[1] + ".wikipedia.org/api/rest_v1/page/html/" + m[2] : u;
}

function openPage(url, title) {
  if (!rdWebUrl(url)) return;
  RD.stack.push({ url: url, title: title || "" });
  rdShow();
}

function rdShell() {
  var el = $("pgv");
  if (!el) {
    el = document.createElement("div");
    el.id = "pgv";
    el.setAttribute("role", "dialog");
    document.body.appendChild(el);
  }
  el.className = "on";
  return el;
}

function rdShow() {
  var cur = RD.stack[RD.stack.length - 1];
  if (!cur) return;
  var el = rdShell(),
    seq = ++RD.seq,
    host = rdHost(cur.url);
  el.innerHTML =
    '<div class="pgvbar">' +
    (RD.stack.length > 1 ? '<button class="ghost" data-pgv="b" aria-label="Back">‹</button>' : "") +
    '<div><b id="pgvt">' +
    esc(cur.title || host) +
    '</b><span class="mono">' +
    esc(host.toUpperCase()) +
    '</span></div><button class="ghost" data-pgv="x" aria-label="Close">✕</button></div>' +
    '<div class="pgvbody" id="pgvb"><div class="pgvload"><i></i><i></i><i></i><span class="mono">OPENING ' +
    esc(host.toUpperCase()) +
    "…</span></div></div>";
  netGet(rdSource(cur.url), 20000, { Accept: "text/html,application/xhtml+xml" }, true)
    .then(function (html) {
      if (seq !== RD.seq) return;
      rdRender(rdExtract(String(html || ""), cur.url), cur);
    })
    .catch(function () {
      if (seq !== RD.seq) return;
      rdRender(null, cur);
    });
}

// Finds a page's title, lead picture, summary and main article.
function rdExtract(html, url) {
  var doc = new DOMParser().parseFromString(html, "text/html"),
    meta = function (k) {
      var m = doc.querySelector('meta[property="' + k + '"],meta[name="' + k + '"]');
      return m ? String(m.getAttribute("content") || "").trim() : "";
    },
    out = {
      title: meta("og:title") || (doc.title || "").trim(),
      site: meta("og:site_name"),
      desc: meta("og:description") || meta("description"),
      img: "",
      root: null,
      base: url
    };
  var im = meta("og:image");
  if (im) {
    try {
      im = new URL(im, url).href;
    } catch (x) {
      im = "";
    }
    if (/^https:\/\//.test(im)) out.img = im;
  }
  if (!doc.body) return out;
  [].forEach.call(doc.querySelectorAll(RD_DROP), function (n) {
    n.remove();
  });
  // Menus, share bars and the like go, but never a block holding most of the page's text.
  var all = (doc.body.textContent || "").length;
  [].forEach.call(doc.body.querySelectorAll("[class],[id]"), function (n) {
    if (
      n.isConnected &&
      RD_JUNK.test(String(n.className || "") + " " + (n.id || "")) &&
      (n.textContent || "").length < all * 0.3
    )
      n.remove();
  });
  // Each paragraph scores its parent fully and its grandparent by half; the best block is the article.
  var best = null,
    bs = 0,
    sc = new Map();
  [].forEach.call(doc.body.querySelectorAll("p,pre,li"), function (p) {
    var t = (p.textContent || "").trim().length;
    if (t < 25) return;
    var s = t + (p.textContent.match(/,/g) || []).length * 10,
      a = p.parentElement,
      g = a && a.parentElement;
    if (a) sc.set(a, (sc.get(a) || 0) + s);
    if (g) sc.set(g, (sc.get(g) || 0) + s / 2);
  });
  sc.forEach(function (v, n) {
    if (v > bs) {
      bs = v;
      best = n;
    }
  });
  out.root = best || doc.querySelector("article,main,[role=main]") || doc.body;
  if (!out.title) {
    var h = out.root.querySelector("h1") || doc.querySelector("h1");
    out.title = h ? h.textContent.trim() : "";
  }
  return out;
}

// Rebuilds the article from scratch using only allowed elements, plain text and checked addresses.
function rdBuild(root, base) {
  var frag = document.createDocumentFragment(),
    words = 0,
    abs = function (u) {
      try {
        return new URL(u, base).href;
      } catch (x) {
        return "";
      }
    },
    inline = function (src, dst) {
      [].forEach.call(src.childNodes, function (n) {
        if (n.nodeType === 3) {
          dst.appendChild(document.createTextNode(n.nodeValue));
          return;
        }
        if (n.nodeType !== 1) return;
        var tg = n.tagName,
          e;
        if (tg === "A") {
          var h = abs(n.getAttribute("href") || "");
          if (rdWebUrl(h)) {
            e = document.createElement("a");
            e.href = h;
          } else e = document.createElement("span");
        } else if (tg === "B" || tg === "STRONG") e = document.createElement("b");
        else if (tg === "I" || tg === "EM") e = document.createElement("i");
        else if (tg === "BR") {
          dst.appendChild(document.createElement("br"));
          return;
        } else if (tg === "SUP" && /^\[?\d+\]?$/.test(n.textContent.trim())) return;
        else e = document.createElement("span");
        inline(n, e);
        dst.appendChild(e);
      });
    },
    pic = function (n) {
      var s = abs(n.getAttribute("src") || n.getAttribute("data-src") || "");
      if (!/^https:\/\//.test(s) || +(n.getAttribute("width") || 99) < 60) return;
      var f = document.createElement("figure"),
        i = document.createElement("img");
      i.src = s;
      i.alt = n.getAttribute("alt") || "";
      i.loading = "lazy";
      i.referrerPolicy = "no-referrer";
      i.onerror = function () {
        f.remove();
      };
      f.appendChild(i);
      frag.appendChild(f);
    },
    walk = function (node) {
      [].forEach.call(node.children, function (n) {
        var tg = n.tagName,
          txt = (n.textContent || "").trim(),
          e;
        if (/^H[1-6]$/.test(tg)) {
          if (!txt || tg === "H1") return;
          e = document.createElement(tg === "H2" ? "h3" : "h4");
          e.textContent = txt;
        } else if (tg === "P" || tg === "BLOCKQUOTE" || tg === "PRE") {
          if (!txt) {
            [].forEach.call(n.querySelectorAll("img"), pic);
            return;
          }
          e = document.createElement(tg === "P" ? "p" : tg.toLowerCase());
          inline(n, e);
          words += txt.split(/\s+/).length;
        } else if (tg === "UL" || tg === "OL") {
          e = document.createElement(tg.toLowerCase());
          [].forEach.call(n.children, function (li) {
            if (li.tagName !== "LI" || !li.textContent.trim()) return;
            var l = document.createElement("li");
            inline(li, l);
            e.appendChild(l);
          });
          if (!e.children.length) return;
        } else if (tg === "TABLE") {
          e = document.createElement("table");
          [].slice.call(n.querySelectorAll("tr"), 0, 40).forEach(function (tr) {
            var r = document.createElement("tr");
            [].slice.call(tr.children, 0, 6).forEach(function (td) {
              var c = document.createElement(td.tagName === "TH" ? "th" : "td");
              c.textContent = td.textContent.trim().slice(0, 200);
              r.appendChild(c);
            });
            if (r.children.length) e.appendChild(r);
          });
          if (!e.children.length) return;
        } else if (tg === "IMG") {
          pic(n);
          return;
        } else if (tg === "FIGCAPTION") {
          e = document.createElement("p");
          e.className = "cap";
          e.textContent = txt;
        } else {
          walk(n);
          return;
        }
        frag.appendChild(e);
      });
    };
  walk(root);
  return { frag: frag, words: words };
}

function rdRender(x, cur) {
  var b = $("pgvb");
  if (!b) return;
  var host = rdHost(cur.url);
  b.innerHTML = "";
  var card = document.createElement("article");
  card.className = "pgvcard";
  if (x && x.img) {
    var hi = document.createElement("img");
    hi.className = "hero";
    hi.src = x.img;
    hi.alt = "";
    hi.referrerPolicy = "no-referrer";
    hi.onerror = function () {
      hi.remove();
    };
    card.appendChild(hi);
  }
  var tag = document.createElement("span");
  tag.className = "tag mono";
  tag.textContent = ((x && x.site) || host).toUpperCase();
  card.appendChild(tag);
  var h = document.createElement("h2");
  h.textContent = (x && x.title) || cur.title || host;
  card.appendChild(h);
  if ($("pgvt")) $("pgvt").textContent = h.textContent;
  var built = x && x.root ? rdBuild(x.root, x.base) : { frag: null, words: 0 };
  if (built.words >= 40) card.appendChild(built.frag);
  else {
    var p = document.createElement("p");
    p.textContent =
      x && x.desc
        ? x.desc
        : x
          ? "This page is mostly an interactive tool rather than an article, so there is nothing here to show in the app."
          : "This page could not be loaded right now. Check your connection and try again.";
    card.appendChild(p);
    if (!x) {
      var again = document.createElement("button");
      again.className = "open";
      again.setAttribute("data-pgv", "r");
      again.textContent = "↻ TRY AGAIN";
      card.appendChild(again);
    }
  }
  var src = document.createElement("p");
  src.className = "src mono";
  src.textContent = "SOURCE · " + host.toUpperCase() + " · SHOWN IN OJOS DE DIOS";
  card.appendChild(src);
  b.appendChild(card);
  b.scrollTop = 0;
}

function closePage() {
  towStop();
  RD.stack = [];
  RD.seq++;
  var el = $("pgv");
  if (el) {
    el.className = "";
    el.innerHTML = "";
  }
}

// Any link to an outside page, wherever it is drawn, opens as an app screen instead of leaving the app.
document.addEventListener(
  "click",
  function (e) {
    var b = e.target.closest("[data-pgv]");
    if (b) {
      e.preventDefault();
      var k = b.getAttribute("data-pgv");
      if (k === "x") closePage();
      else if (k === "b") {
        RD.stack.pop();
        rdShow();
      } else if (k === "r") rdShow();
      return;
    }
    var a = e.target.closest("a[href]");
    if (!a || a.hasAttribute("download")) return;
    var u = a.href;
    if (!rdWebUrl(u) || rdSameApp(u)) return;
    e.preventDefault();
    openPage(
      u,
      (a.textContent || "")
        .replace(/^[↗▸\s]+/, "")
        .trim()
        .slice(0, 60)
    );
  },
  true
);

// Code that asks for a new window gets the app screen instead.
(function () {
  var wo = window.open;
  window.open = function (u) {
    if (rdWebUrl(u) && !rdSameApp(u)) {
      openPage(u);
      return null;
    }
    return wo.apply(window, arguments);
  };
})();
