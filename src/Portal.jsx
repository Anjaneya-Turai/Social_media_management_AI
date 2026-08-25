import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload, Instagram, Facebook, Linkedin, Heart, MessageCircle, Send, Bookmark,
  MoreHorizontal, ThumbsUp, Share2, Repeat2, Globe, Check, X, Copy, ChevronLeft,
  ChevronRight, Lock, ClipboardList, Image as ImageIcon, Trash2, CircleDot, Pencil, Plus,
} from "lucide-react";
import * as api from "./api";

/* ------------------------------------------------------------------ tokens */
const T = {
  ink: "#1B1714",
  charcoal: "#231E1A",
  ivory: "#FBF7F0",
  champagne: "#EFE3CD",
  gold: "#B0842A",
  goldSoft: "#D8B667",
  maroon: "#6E1B2B",
  emerald: "#1E5B49",
  muted: "#8B8075",
  line: "#E3D9C9",
};
const DISPLAY = '"Didot","Bodoni MT","Playfair Display",Georgia,"Times New Roman",serif';
const BODY = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

/* mix a hex colour toward white, e.g. tint("#B0842A", 0.15) */
function tint(hex, amount) {
  const h = String(hex).replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return "#F4EEE4";
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (v) => Math.round(v * amount + 255 * (1 - amount));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/* stable per-post sample engagement, so numbers never jump between renders */
const hashInt = (str, min, max) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 100000;
  return min + (h % (max - min));
};
const groupCount = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString());

/* ----------------------------------------------------------------- parsing */
const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const FIELD_RE = /^(Type|Format|HOOK|CAPTION|HASHTAGS|AI VISUAL|VISUAL|SCRIPT|TEXT ON SCREEN|SLIDE\s+\d+)\s*:\s*(.*)$/i;
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

function tidy(lines) {
  const out = [...lines];
  while (out.length && !out[0].trim()) out.shift();
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out.join("\n");
}

function parseFields(raw) {
  const f = { slides: [], other: [] };
  let key = null;
  let buf = [];
  const flush = () => {
    if (!key) return;
    const value = tidy(buf);
    if (key === "slide") { if (value) f.slides.push(value); }
    else f[key] = value;
    buf = [];
  };
  const map = {
    "type": "type", "format": "format", "hook": "hook", "caption": "caption",
    "hashtags": "hashtags", "ai visual": "visual", "visual": "visual",
    "script": "script", "text on screen": "screenText",
  };
  for (const line of raw) {
    if (line.trim() === "---") continue;
    const m = line.match(FIELD_RE);
    if (m) {
      flush();
      const label = m[1].toLowerCase().replace(/\s+/g, " ");
      key = label.startsWith("slide") ? "slide" : map[label];
      buf = m[2] ? [m[2]] : [];
      continue;
    }
    if (key) buf.push(line);
    else if (line.trim()) f.other.push(line);
  }
  flush();
  f.hook = (f.hook || "").replace(/^"|"$/g, "").trim();
  f.tags = (f.hashtags || "").split(/\s+/).filter((t) => t.startsWith("#"));
  return f;
}

function parsePlan(md) {
  const lines = String(md).replace(/\r/g, "").split("\n");
  let title = "";
  const meta = [], days = [], posts = [], briefLines = [], appendix = [];
  let mode = "head", day = null, post = null, section = null;

  const closePost = () => {
    if (!post) return;
    post.fields = parseFields(post.raw);
    delete post.raw;
    posts.push(post);
    post = null;
  };

  for (const line of lines) {
    const h1 = line.match(/^#\s+(.*\S)\s*$/);
    const h2 = line.match(/^##\s+(.*\S)\s*$/);
    const h3 = line.match(/^###\s+(.*\S)\s*$/);

    if (h3 && /post/i.test(h3[1])) {
      closePost();
      const m = h3[1].match(/POST\s*(\d+)\s*[—–-]?\s*(.*)$/i);
      post = {
        number: m ? Number(m[1]) : posts.length + 1,
        slot: m && m[2] ? m[2].trim() : "",
        dayId: day ? day.id : "unscheduled",
        dayLabel: day ? day.label : "Unscheduled",
        theme: day ? day.theme : "",
        raw: [],
      };
      post.id = `${post.dayId}-p${post.number}`;
      if (day) day.postIds.push(post.id);
      mode = "post";
      continue;
    }
    if (h1) {
      const text = h1[1];
      const first = text.split(/[\s—–-]/)[0].toUpperCase();
      if (WEEKDAYS.includes(first)) {
        closePost();
        day = { id: slugify(text), label: text, theme: "", postIds: [] };
        days.push(day);
        mode = "day";
        continue;
      }
      if (!posts.length && !post && !title) { title = text; mode = "head"; continue; }
      closePost();
      section = { heading: text, lines: [] };
      if (posts.length) { appendix.push(section); mode = "appendix"; }
      else { briefLines.push(`## ${text}`); mode = "brief"; }
      continue;
    }
    if (h2) {
      const text = h2[1];
      if (mode === "day" && /^theme\s*:/i.test(text)) {
        day.theme = text.replace(/^theme\s*:\s*/i, "").replace(/^"|"$/g, "");
        continue;
      }
      if (mode === "head") {
        if (/^[A-Za-z][A-Za-z ]*:/.test(text)) { meta.push(text); continue; }
        mode = "brief"; briefLines.push(`## ${text}`); continue;
      }
    }
    if (mode === "post" && post) post.raw.push(line);
    else if (mode === "appendix" && section) section.lines.push(line);
    else if (mode === "brief") briefLines.push(line);
  }
  closePost();

  const brief = tidy(briefLines.filter((l) => l.trim() !== "---"));
  const brandLine = brief.match(/Brand:\s*\n\s*(.+)/);
  const posLine = brief.match(/Positioning:\s*\n\s*(.+)/);
  const siteLine = brief.match(/(https?:\/\/\S+)/);

  return {
    title: title || "Content plan",
    meta: meta.map((m) => {
      const i = m.indexOf(":");
      return { label: m.slice(0, i).trim(), value: m.slice(i + 1).trim() };
    }),
    brand: {
      name: brandLine ? brandLine[1].trim() : (title || "Brand").split("—")[0].trim(),
      tagline: posLine ? posLine[1].trim() : "",
      site: siteLine ? siteLine[1].trim() : "",
    },
    brief,
    appendix: appendix.map((s) => ({ heading: s.heading, body: tidy(s.lines.filter((l) => l.trim() !== "---")) })),
    days, posts,
    uploadedAt: new Date().toISOString(),
  };
}



/* ------------------------------------------------------------------- utils */
const slotTime = (slot) => (/even|night|pm/i.test(slot) ? "6:30 PM" : "8:00 AM");
const dayShort = (label) => {
  const m = label.match(/^([A-Z]+)\s*[—–-]\s*(.*)$/i);
  if (!m) return label;
  const d = m[1][0] + m[1].slice(1, 3).toLowerCase();
  return `${d} ${m[2].replace(/\s*SEPTEMBER/i, " Sep").replace(/\s*OCTOBER/i, " Oct").replace(/\s*AUGUST/i, " Aug")}`;
};
const initials = (name) => name.split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();

function RichText({ text, tags = [], clamp = 0, expanded, onExpand, tagColor = "#00376B" }) {
  const full = [text, tags.join(" ")].filter(Boolean).join("\n\n");
  const short = clamp && !expanded && full.length > clamp ? full.slice(0, clamp).trimEnd() : full;
  const truncated = short.length < full.length;
  return (
    <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {short.split(/(\s+)/).map((tok, i) =>
        tok.startsWith("#") || tok.startsWith("@")
          ? <span key={i} style={{ color: tagColor }}>{tok}</span>
          : <span key={i}>{tok}</span>
      )}
      {truncated && (
        <>
          <span style={{ color: T.muted }}>… </span>
          <button onClick={onExpand} style={{ color: T.muted, fontFamily: BODY }} className="underline">more</button>
        </>
      )}
    </span>
  );
}

function Verified({ size = 12, color = "#0095F6" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M12 1.5l2.3 2.1 3.1-.3.9 3 2.8 1.4-1 3 1 3-2.8 1.4-.9 3-3.1-.3L12 22.5l-2.3-2.1-3.1.3-.9-3-2.8-1.4 1-3-1-3L5.7 6.3l.9-3 3.1.3L12 1.5z" />
      <path d="M10.6 15.6l-3-3 1.2-1.2 1.8 1.8 4.2-4.2 1.2 1.2-5.4 5.4z" fill="#fff" />
    </svg>
  );
}

function Avatar({ brand, size = 38, ring, square }) {
  const radius = square ? 8 : 999;
  const inner = brand.logo ? (
    <img src={brand.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: radius }} />
  ) : (
    <div className="flex items-center justify-center w-full h-full"
      style={{
        borderRadius: radius,
        background: `linear-gradient(135deg, ${brand.deep}, ${brand.accent})`,
        color: "#fff", fontFamily: DISPLAY, fontSize: Math.round(size * 0.4), letterSpacing: "0.04em",
      }}>
      {initials(brand.name)}
    </div>
  );

  if (!ring) {
    return <div className="shrink-0 overflow-hidden" style={{ width: size, height: size, borderRadius: radius }}>{inner}</div>;
  }
  return (
    <div className="shrink-0 flex items-center justify-center"
      style={{
        width: size + 6, height: size + 6, borderRadius: 999, padding: 2,
        background: brand.brandRing
          ? `linear-gradient(45deg, ${brand.deep}, ${brand.accent})`
          : "linear-gradient(45deg,#F9CE34,#EE2A7B,#6228D7)",
      }}>
      <div className="flex items-center justify-center" style={{ width: size + 2, height: size + 2, borderRadius: 999, background: "#fff" }}>
        <div className="overflow-hidden" style={{ width: size - 2, height: size - 2, borderRadius: 999 }}>{inner}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ media canvas */
function Media({ post, img, ratio, adminSlot, brand }) {
  const slides = post.fields.slides || [];
  const [i, setI] = useState(0);
  const has = slides.length > 1;
  useEffect(() => setI(0), [post.id]);
  return (
    <div className="relative w-full overflow-hidden" style={{ aspectRatio: ratio, background: tint(brand.accent, 0.16) }}>
      {img
        ? <img src={img} alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: "cover" }} />
        : (
          <div className="absolute inset-0 flex flex-col justify-center p-6"
            style={{ background: `linear-gradient(160deg, ${tint(brand.accent, 0.20)}, ${tint(brand.accent, 0.06)})` }}>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.18em", color: brand.accent }}>IMAGE PENDING</div>
            <div className="mt-3" style={{ fontFamily: DISPLAY, fontSize: 17, lineHeight: 1.3, color: T.ink }}>
              {post.fields.hook || post.theme || "Visual to come"}
            </div>
            {post.fields.visual && (
              <div className="mt-3" style={{ fontFamily: BODY, fontSize: 11, lineHeight: 1.5, color: T.muted }}>
                {post.fields.visual.slice(0, 180)}
              </div>
            )}
          </div>
        )}

      {has && (
        <>
          <div className="absolute inset-x-0 bottom-0 p-4" style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.62))" }}>
            <div style={{ fontFamily: DISPLAY, color: "#fff", fontSize: 18, lineHeight: 1.35, whiteSpace: "pre-wrap" }}>
              {slides[i]}
            </div>
          </div>
          <button onClick={() => setI((v) => Math.max(0, v - 1))} className="absolute left-1 top-1/2 p-1 rounded-full" style={{ background: "rgba(255,255,255,0.85)", transform: "translateY(-50%)" }}>
            <ChevronLeft size={16} color={T.ink} />
          </button>
          <button onClick={() => setI((v) => Math.min(slides.length - 1, v + 1))} className="absolute right-1 top-1/2 p-1 rounded-full" style={{ background: "rgba(255,255,255,0.85)", transform: "translateY(-50%)" }}>
            <ChevronRight size={16} color={T.ink} />
          </button>
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.6)", color: "#fff", fontFamily: MONO, fontSize: 10 }}>
            {i + 1}/{slides.length}
          </div>
        </>
      )}
      {adminSlot}
    </div>
  );
}

/* -------------------------------------------------------------- previews */
/* Chrome colours below are each platform's own, deliberately. The brand shows
   where it shows in real life: the profile picture, the story ring, the art. */

/* Instagram */
function IgPreview({ post, brand, img, expanded, onExpand, metrics }) {
  const likes = hashInt(post.id, 140, 1900);
  const comments = hashInt(post.id + "c", 4, 48);
  return (
    <div style={{ background: "#fff", fontFamily: BODY, color: "#262626" }}>
      <div className="flex items-center gap-2.5 px-3 py-2">
        <Avatar brand={brand} size={32} ring />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-1">
            <span style={{ fontSize: 13, fontWeight: 600 }}>{brand.handle}</span>
            {brand.verified && <Verified />}
          </div>
          {brand.city && <div style={{ fontSize: 11 }}>{brand.city}</div>}
        </div>
        <MoreHorizontal size={18} color="#262626" />
      </div>

      <Media post={post} img={img} ratio="4 / 5" brand={brand} />

      <div className="flex items-center px-3 pt-2.5" style={{ gap: 14 }}>
        <Heart size={24} strokeWidth={1.6} />
        <MessageCircle size={23} strokeWidth={1.6} style={{ transform: "scaleX(-1)" }} />
        <Send size={22} strokeWidth={1.6} />
        <div className="flex-1" />
        <Bookmark size={23} strokeWidth={1.6} />
      </div>

      <div className="px-3 pt-2 pb-3" style={{ fontSize: 13, lineHeight: 1.45 }}>
        {metrics && <div style={{ fontWeight: 600 }}>{groupCount(likes)} likes</div>}
        <div className="mt-1">
          <span style={{ fontWeight: 600 }}>{brand.handle} </span>
          <RichText text={post.fields.caption} tags={post.fields.tags} clamp={expanded ? 0 : 125}
            expanded={expanded} onExpand={onExpand} tagColor="#00376B" />
        </div>
        {metrics && <div className="mt-1" style={{ color: "#8E8E8E" }}>View all {comments} comments</div>}
        <div className="mt-1.5" style={{ fontSize: 10, color: "#8E8E8E", letterSpacing: "0.02em" }}>
          {dayShort(post.dayLabel).toUpperCase()} · {slotTime(post.slot)}
        </div>
      </div>
    </div>
  );
}

/* Facebook */
function FbPreview({ post, brand, img, expanded, onExpand, metrics }) {
  const reactions = hashInt(post.id + "f", 40, 480);
  const comments = hashInt(post.id + "fc", 3, 29);
  const shares = hashInt(post.id + "fs", 1, 14);
  return (
    <div style={{ background: "#fff", fontFamily: BODY, color: "#050505" }}>
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
        <Avatar brand={brand} size={40} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-1">
            <span style={{ fontSize: 15, fontWeight: 600 }}>{brand.name}</span>
            {brand.verified && <Verified color="#1877F2" />}
          </div>
          <div className="flex items-center gap-1 mt-0.5" style={{ fontSize: 12, color: "#65676B" }}>
            {dayShort(post.dayLabel)} at {slotTime(post.slot)} · <Globe size={12} />
          </div>
        </div>
        <MoreHorizontal size={20} color="#65676B" />
      </div>

      <div className="px-3 pb-2.5" style={{ fontSize: 15, lineHeight: 1.45 }}>
        <RichText text={post.fields.caption} tags={post.fields.tags} clamp={expanded ? 0 : 200}
          expanded={expanded} onExpand={onExpand} tagColor="#1877F2" />
      </div>

      <Media post={post} img={img} ratio="4 / 5" brand={brand} />

      {metrics && (
        <div className="flex items-center px-3 py-2" style={{ fontSize: 13, color: "#65676B" }}>
          <span className="flex items-center justify-center" style={{ width: 18, height: 18, borderRadius: 999, background: "#1877F2" }}>
            <ThumbsUp size={10} color="#fff" fill="#fff" />
          </span>
          <span className="flex items-center justify-center" style={{ width: 18, height: 18, borderRadius: 999, background: "#F3425F", marginLeft: -5, border: "1.5px solid #fff" }}>
            <Heart size={9} color="#fff" fill="#fff" />
          </span>
          <span className="ml-1.5">{reactions}</span>
          <div className="flex-1" />
          <span>{comments} comments</span>
          <span className="ml-2">{shares} shares</span>
        </div>
      )}

      <div className="mx-3" style={{ borderTop: "1px solid #CED0D4" }} />
      <div className="flex items-center justify-around py-1.5" style={{ color: "#65676B", fontSize: 15, fontWeight: 600 }}>
        <span className="flex items-center gap-2 px-3 py-1.5"><ThumbsUp size={18} /> Like</span>
        <span className="flex items-center gap-2 px-3 py-1.5"><MessageCircle size={18} /> Comment</span>
        <span className="flex items-center gap-2 px-3 py-1.5"><Share2 size={18} /> Share</span>
      </div>
    </div>
  );
}

/* LinkedIn */
function LiPreview({ post, brand, img, expanded, onExpand, metrics }) {
  const reactions = hashInt(post.id + "l", 18, 240);
  const comments = hashInt(post.id + "lc", 2, 22);
  return (
    <div style={{ background: "#fff", fontFamily: BODY, color: "rgba(0,0,0,0.9)" }}>
      <div className="flex items-start gap-2 px-3 pt-3 pb-2">
        <Avatar brand={brand} size={48} square />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-1">
            <span style={{ fontSize: 14, fontWeight: 600 }}>{brand.name}</span>
            {brand.verified && <Verified color="#0A66C2" />}
          </div>
          <div className="truncate" style={{ fontSize: 12, color: "rgba(0,0,0,0.6)" }}>{brand.tagline || brand.city}</div>
          <div className="flex items-center gap-1" style={{ fontSize: 12, color: "rgba(0,0,0,0.6)" }}>1d · <Globe size={12} /></div>
        </div>
        <MoreHorizontal size={20} color="rgba(0,0,0,0.6)" />
      </div>

      <div className="px-3 pb-3" style={{ fontSize: 14, lineHeight: 1.45 }}>
        <RichText text={post.fields.caption} tags={post.fields.tags} clamp={expanded ? 0 : 180}
          expanded={expanded} onExpand={onExpand} tagColor="#0A66C2" />
      </div>

      <Media post={post} img={img} ratio="1 / 1" brand={brand} />

      {metrics && (
        <div className="flex items-center px-3 py-2" style={{ fontSize: 12, color: "rgba(0,0,0,0.6)" }}>
          <span className="flex items-center justify-center" style={{ width: 16, height: 16, borderRadius: 999, background: "#378FE9" }}>
            <ThumbsUp size={9} color="#fff" fill="#fff" />
          </span>
          <span className="ml-1.5">{reactions}</span>
          <div className="flex-1" />
          <span>{comments} comments</span>
        </div>
      )}

      <div className="mx-3" style={{ borderTop: "1px solid #E9E5DF" }} />
      <div className="flex items-center justify-around py-1.5" style={{ color: "rgba(0,0,0,0.6)", fontSize: 14, fontWeight: 600 }}>
        <span className="flex items-center gap-1.5 px-2 py-1.5"><ThumbsUp size={18} /> Like</span>
        <span className="flex items-center gap-1.5 px-2 py-1.5"><MessageCircle size={18} /> Comment</span>
        <span className="flex items-center gap-1.5 px-2 py-1.5"><Repeat2 size={18} /> Repost</span>
        <span className="flex items-center gap-1.5 px-2 py-1.5"><Send size={18} /> Send</span>
      </div>
    </div>
  );
}

/* Pinterest */
function PinPreview({ post, brand, img, metrics }) {
  const desc = (post.fields.caption || "").split("\n").filter(Boolean).slice(0, 2).join(" ");
  const saves = hashInt(post.id + "p", 12, 340);
  const source = (brand.site || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  return (
    <div style={{ background: "#fff", fontFamily: BODY, color: "#111" }} className="p-3">
      <div className="relative overflow-hidden" style={{ borderRadius: 16 }}>
        <Media post={post} img={img} ratio="2 / 3" brand={brand} />
        <div className="absolute top-2 right-2 px-3.5 py-2 rounded-full"
          style={{ background: "#E60023", color: "#fff", fontSize: 13, fontWeight: 700 }}>
          Save
        </div>
      </div>
      {source && <div className="pt-2" style={{ fontSize: 11, color: "#767676" }}>{source}</div>}
      <div className="pt-1" style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>
        {post.fields.hook || post.theme}
      </div>
      <div className="pt-1" style={{ fontSize: 13, color: "#5F5F5F", lineHeight: 1.45 }}>{desc}</div>
      <div className="flex items-center gap-2 pt-3">
        <Avatar brand={brand} size={28} />
        <div style={{ fontSize: 13, fontWeight: 600 }}>{brand.name}</div>
        {metrics && <div style={{ fontSize: 12, color: "#767676" }}>· {saves} saves</div>}
      </div>
      <div className="pt-2" style={{ fontSize: 11, color: "#767676" }}>{post.fields.tags.slice(0, 6).join(" ")}</div>
    </div>
  );
}

const PLATFORMS = [
  { id: "instagram", label: "Instagram", Icon: Instagram, C: IgPreview, page: "#FAFAFA", frame: "#111" },
  { id: "facebook", label: "Facebook", Icon: Facebook, C: FbPreview, page: "#F0F2F5", frame: "#111" },
  { id: "linkedin", label: "LinkedIn", Icon: Linkedin, C: LiPreview, page: "#F4F2EE", frame: "#111" },
  { id: "pinterest", label: "Pinterest", Icon: CircleDot, C: PinPreview, page: "#FFFFFF", frame: "#111" },
];

/* ------------------------------------------------------------------ pieces */
function Chip({ children, tone = "neutral", onClick, active }) {
  const tones = {
    neutral: { bg: "transparent", fg: T.muted, bd: T.line },
    gold: { bg: "#FBF3E2", fg: T.gold, bd: "#EBD9B4" },
    green: { bg: "#E9F2EE", fg: T.emerald, bd: "#C9E0D7" },
    maroon: { bg: "#F7E9EC", fg: T.maroon, bd: "#EBCFD5" },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="px-2.5 py-1 rounded-full"
      style={{
        background: active ? T.ink : t.bg, color: active ? T.ivory : t.fg,
        border: `1px solid ${active ? T.ink : t.bd}`,
        fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
      }}
    >
      {children}
    </button>
  );
}

function Section({ label, children, right }) {
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between mb-2">
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: T.gold }}>{label}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------ post editing */
const fieldsToDraft = (p) => ({
  theme: p.theme || "",
  type: p.fields.type || "",
  format: p.fields.format || "",
  hook: p.fields.hook || "",
  caption: p.fields.caption || "",
  hashtags: (p.fields.tags || []).join(" "),
  script: p.fields.script || "",
  screenText: p.fields.screenText || "",
  visual: p.fields.visual || "",
  slides: [...(p.fields.slides || [])],
});

const draftToFields = (d) => ({
  type: d.type.trim(),
  format: d.format.trim(),
  hook: d.hook.trim(),
  caption: d.caption,
  script: d.script,
  screenText: d.screenText,
  visual: d.visual,
  hashtags: d.hashtags.trim(),
  tags: d.hashtags.split(/\s+/).filter((t) => t.startsWith("#")),
  slides: d.slides.filter((x) => x.trim()),
  other: [],
});

function Field({ label, value, onChange, rows = 3, mono }) {
  return (
    <label className="block mt-3">
      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: T.gold }}>{label}</span>
      {rows === 1 ? (
        <input value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full mt-1 px-3 py-2 rounded-lg"
          style={{ border: `1px solid ${T.line}`, background: "#fff", fontSize: 14 }} />
      ) : (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows}
          className="w-full mt-1 px-3 py-2 rounded-lg"
          style={{ border: `1px solid ${T.line}`, background: "#fff", fontSize: 14, lineHeight: 1.55, resize: "vertical", fontFamily: mono ? MONO : BODY }} />
      )}
    </label>
  );
}

function PostEditor({ draft, setDraft, onSave, onCancel, saving }) {
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  return (
    <div className="p-4 rounded-2xl" style={{ background: "#fff", border: `1px solid ${T.line}` }}>
      <div style={{ fontFamily: DISPLAY, fontSize: 18 }}>Edit post</div>
      <p className="mt-1" style={{ fontSize: 12, color: T.muted }}>The preview above updates as you type. Nothing saves until you tap Save changes.</p>
      <Field label="THEME" value={draft.theme} onChange={set("theme")} rows={1} />
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
        <Field label="TYPE" value={draft.type} onChange={set("type")} rows={1} />
        <Field label="FORMAT" value={draft.format} onChange={set("format")} rows={1} />
      </div>
      <Field label="HOOK" value={draft.hook} onChange={set("hook")} rows={2} />
      <Field label="CAPTION" value={draft.caption} onChange={set("caption")} rows={10} />
      <Field label="HASHTAGS" value={draft.hashtags} onChange={set("hashtags")} rows={3} mono />
      <Field label="SCRIPT" value={draft.script} onChange={set("script")} rows={4} />
      <Field label="ON-SCREEN TEXT" value={draft.screenText} onChange={set("screenText")} rows={3} />
      <Field label="IMAGE BRIEF" value={draft.visual} onChange={set("visual")} rows={4} />

      <div className="mt-4">
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: T.gold }}>SLIDES</span>
        {draft.slides.map((sl, i) => (
          <div key={i} className="flex gap-2 mt-2">
            <textarea value={sl} rows={2}
              onChange={(e) => setDraft((d) => ({ ...d, slides: d.slides.map((x, j) => (j === i ? e.target.value : x)) }))}
              className="flex-1 px-3 py-2 rounded-lg"
              style={{ border: `1px solid ${T.line}`, fontSize: 13, resize: "vertical" }} />
            <button onClick={() => setDraft((d) => ({ ...d, slides: d.slides.filter((_, j) => j !== i) }))}
              className="px-2 rounded-lg" style={{ border: `1px solid ${T.line}`, color: T.maroon }} title="Remove slide">
              <X size={14} />
            </button>
          </div>
        ))}
        <button onClick={() => setDraft((d) => ({ ...d, slides: [...d.slides, ""] }))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full mt-2"
          style={{ border: `1px solid ${T.line}`, fontSize: 12 }}>
          <Plus size={13} />Add slide
        </button>
      </div>

      <div className="flex gap-2 mt-5">
        <button onClick={onSave} disabled={saving} className="px-4 py-2 rounded-lg"
          style={{ background: T.ink, color: T.ivory, fontSize: 13, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving" : "Save changes"}
        </button>
        <button onClick={onCancel} className="px-4 py-2 rounded-lg" style={{ border: `1px solid ${T.line}`, fontSize: 13 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- app */
export default function Portal() {
  const [ready, setReady] = useState(false);
  const [plan, setPlan] = useState(null);
  const [images, setImages] = useState({});
  const [feedback, setFeedback] = useState({});
  const [brandCfg, setBrandCfg] = useState({});
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [me, setMe] = useState({ name: "", role: "client" });
  const [platform, setPlatform] = useState("instagram");
  const [selected, setSelected] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState("posts");
  const [toast, setToast] = useState("");
  const [pinPrompt, setPinPrompt] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const fileRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const { plan: p, images: im, feedback: fb, brand: br } = await api.loadAll();
        if (p) { setPlan(p); if (p.posts.length) setSelected(p.posts[0].id); }
        if (im) setImages(im);
        if (fb) setFeedback(fb);
        if (br) setBrandCfg(br);
      } catch (e) {
        setLoadError("Could not reach the server. Reload to try again.");
      }
      setMe({ name: api.localName(), role: api.savedPass() ? "admin" : "client" });
      setReady(true);
    })();
  }, []);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2600); };
  const isAdmin = me.role === "admin";
  const post = useMemo(() => (plan ? plan.posts.find((p) => p.id === selected) : null), [plan, selected]);
  const brand = useMemo(() => {
    const b = plan ? plan.brand : { name: "Brand", tagline: "", site: "" };
    const planCity = plan ? (plan.meta.find((m) => /location/i.test(m.label)) || {}).value || "" : "";
    const name = brandCfg.name || b.name;
    return {
      name,
      handle: brandCfg.handle || name.toLowerCase().replace(/[^a-z0-9]/g, ""),
      tagline: brandCfg.tagline || b.tagline,
      city: brandCfg.city || planCity.split(",").slice(0, 2).join(", "),
      site: brandCfg.site || b.site,
      logo: brandCfg.logo || "",
      verified: Boolean(brandCfg.verified),
      brandRing: Boolean(brandCfg.brandRing),
      metrics: brandCfg.metrics !== false,
      accent: brandCfg.accent || T.gold,
      deep: brandCfg.deep || T.maroon,
    };
  }, [plan, brandCfg]);

  const fbFor = (id) => feedback[id] || { status: "pending", comments: [] };
  const openCount = useMemo(
    () => Object.values(feedback).reduce((n, f) => n + (f.comments || []).filter((c) => !c.resolved).length, 0),
    [feedback]
  );

  async function saveFeedback(id, mut) {
    const entry = fbFor(id);
    const next = mut({ ...entry, comments: [...(entry.comments || [])] });
    setFeedback((f) => ({ ...f, [id]: next }));
    try {
      const res = await api.saveEntry(id, next);
      if (res.feedback) setFeedback(res.feedback);
    } catch (e) {
      flash("Could not save that note. Check your connection and try again.");
    }
  }

  async function publish(text) {
    let parsed;
    try { parsed = parsePlan(text); } catch (e) { flash("That file could not be read as a content plan."); return; }
    if (!parsed.posts.length) { flash("No posts found. Headings need to look like ### POST 1 — MORNING."); return; }
    try {
      await api.savePlan(parsed);
      setPlan(parsed);
      setSelected(parsed.posts[0].id);
      setTab("posts");
      flash(`Published ${parsed.posts.length} posts across ${parsed.days.length} days.`);
    } catch (e) {
      flash(/passcode|401/i.test(e.message) ? "Admin passcode rejected. Unlock again." : "Publishing failed. Try again.");
    }
  }

  async function attachImage(file, postId) {
    try {
      const dataUrl = await compress(file);
      const res = await api.saveImage(postId, dataUrl);
      setImages(res.images || { ...images, [postId]: dataUrl });
      flash("Image added.");
    } catch (e) {
      flash("Image upload failed. Try a smaller file.");
    }
  }

  async function removeImage(postId) {
    try {
      const res = await api.deleteImage(postId);
      setImages(res.images || {});
    } catch (e) {
      flash("Could not remove that image.");
    }
  }

  function setName(name) {
    setMe((m) => ({ ...m, name }));
    api.setLocalName(name);
  }

  function enterAdmin() { setPinPrompt(true); }

  async function submitPin() {
    try {
      const res = await api.login(pinInput);
      if (!res.ok) { flash("That passcode does not match."); return; }
      api.setSavedPass(pinInput);
      setMe((m) => ({ ...m, role: "admin" }));
      setPinPrompt(false);
      setPinInput("");
    } catch (e) {
      flash("That passcode does not match, or the site has no ADMIN_PASSCODE set.");
    }
  }

  const shown = draft && post ? { ...post, theme: draft.theme, fields: draftToFields(draft) } : post;

  async function saveEdit() {
    if (!post || !draft) return;
    setSaving(true);
    try {
      const res = await api.updatePost(post.id, draftToFields(draft), draft.theme);
      if (res.plan) setPlan(res.plan);
      setDraft(null);
      flash("Post updated.");
    } catch (e) {
      flash(/passcode|401/i.test(e.message) ? "Admin passcode rejected. Unlock again." : "Could not save the post.");
    }
    setSaving(false);
  }

  async function removePost(postId) {
    setConfirmDel(false);
    try {
      const res = await api.deletePost(postId);
      if (res.plan) {
        setPlan(res.plan);
        if (selected === postId) setSelected(res.plan.posts.length ? res.plan.posts[0].id : null);
      }
      setImages(res.images || {});
      setFeedback(res.feedback || {});
      setDraft(null);
      flash("Post removed.");
    } catch (e) {
      flash(/passcode|401/i.test(e.message) ? "Admin passcode rejected. Unlock again." : "Could not remove that post.");
    }
  }

  async function saveBrand(next) {
    setBrandCfg(next);
    try {
      await api.saveBrand(next);
      flash("Brand settings saved.");
    } catch (e) {
      flash(/passcode|401/i.test(e.message) ? "Admin passcode rejected. Unlock again." : "Could not save brand settings.");
    }
  }

  async function clearEverything() {
    try {
      await api.clearAll();
      setPlan(null); setImages({}); setFeedback({}); setSelected(null); setDraft(null);
      setTab("upload");
      flash("Everything cleared.");
    } catch (e) {
      flash(/passcode|401/i.test(e.message) ? "Admin passcode rejected. Unlock again." : "Could not clear. Try again.");
    }
  }

  const digest = () => {
    if (!plan) return "";
    const lines = [`# Feedback — ${plan.title}`, ""];
    for (const p of plan.posts) {
      const f = fbFor(p.id);
      const open = (f.comments || []).filter((c) => !c.resolved);
      if (f.status === "pending" && !open.length) continue;
      lines.push(`## Post ${p.number} — ${dayShort(p.dayLabel)} ${p.slot} [${f.status}]`);
      for (const c of open) lines.push(`- (${c.kind}) ${c.author}: ${c.text}`);
      lines.push("");
    }
    return lines.join("\n");
  };

  const copy = async (text, msg) => {
    try { await navigator.clipboard.writeText(text); flash(msg); }
    catch (e) { flash("Copy blocked by the browser. Select the text instead."); }
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: T.ivory }}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.2em", color: T.gold }}>LOADING</div>
      </div>
    );
  }

  const pf = PLATFORMS.find((p) => p.id === platform);
  const Preview = pf.C;

  return (
    <div className="min-h-screen" style={{ background: T.ivory, fontFamily: BODY, color: T.ink }}>
      {/* header */}
      <div style={{ background: T.charcoal, color: T.ivory }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.22em", color: T.goldSoft }}>CONTENT REVIEW</div>
            <div className="truncate" style={{ fontFamily: DISPLAY, fontSize: 19, letterSpacing: "0.01em" }}>
              {plan ? plan.brand.name : "Client portal"}
            </div>
          </div>
          <button
            onClick={() => (isAdmin ? (api.clearSavedPass(), setDraft(null), setMe((m) => ({ ...m, role: "client" }))) : enterAdmin())}
            className="px-3 py-1.5 rounded-full flex items-center gap-1.5"
            style={{ border: `1px solid ${T.goldSoft}`, color: T.goldSoft, fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em" }}
          >
            <Lock size={11} />{isAdmin ? "ADMIN" : "CLIENT"}
          </button>
        </div>
      </div>

      {/* passcode sheet */}
      {pinPrompt && (
        <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(27,23,20,0.55)" }}>
          <div className="w-full max-w-sm p-5 rounded-2xl" style={{ background: T.ivory }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 20 }}>Enter admin passcode</div>
            <p className="mt-2" style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
              Set as ADMIN_PASSCODE in your Netlify site settings. Every upload and edit is checked on the server.
            </p>
            <input
              value={pinInput} onChange={(e) => setPinInput(e.target.value)} type="password"
              className="w-full mt-3 px-3 py-2 rounded-lg" style={{ border: `1px solid ${T.line}`, background: "#fff", fontSize: 14 }}
            />
            <div className="flex gap-2 mt-3">
              <button onClick={submitPin} className="flex-1 py-2 rounded-lg" style={{ background: T.ink, color: T.ivory, fontSize: 13 }}>
                Unlock
              </button>
              <button onClick={() => { setPinPrompt(false); setPinInput(""); }} className="px-4 py-2 rounded-lg" style={{ border: `1px solid ${T.line}`, fontSize: 13 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* tabs */}
      <div className="max-w-6xl mx-auto px-4 pt-4 flex items-center gap-2 flex-wrap">
        {[["posts", "Posts"], ["brief", "Brief"], isAdmin ? ["upload", "Upload"] : null, isAdmin ? ["digest", `Feedback${openCount ? ` (${openCount})` : ""}`] : null]
          .filter(Boolean)
          .map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className="pb-1"
              style={{
                fontFamily: MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
                color: tab === id ? T.ink : T.muted, borderBottom: `2px solid ${tab === id ? T.gold : "transparent"}`,
              }}>
              {label}
            </button>
          ))}
      </div>

      {loadError && (
        <div className="max-w-6xl mx-auto px-4 pt-4" style={{ fontSize: 13, color: T.maroon }}>{loadError}</div>
      )}

      {!plan && (
        <div className="max-w-6xl mx-auto px-4 py-16 text-center">
          <div style={{ fontFamily: DISPLAY, fontSize: 24 }}>Nothing published yet</div>
          <p className="mt-2" style={{ fontSize: 13, color: T.muted }}>
            {isAdmin ? "Open Upload and drop in a content plan." : "Your content plan will appear here once it is published."}
          </p>
        </div>
      )}

      {/* ---------------------------------------------------------- posts */}
      {plan && tab === "posts" && (
        <div className="max-w-6xl mx-auto px-4 py-4 grid gap-6" style={{ gridTemplateColumns: "1fr" }}>
          <div className="lg:grid lg:gap-8" style={{ display: "grid", gridTemplateColumns: "1fr" }}>
            {/* schedule rail */}
            <div className="overflow-x-auto -mx-4 px-4 pb-2">
              <div className="flex gap-2" style={{ minWidth: "min-content" }}>
                {plan.posts.map((p) => {
                  const f = fbFor(p.id);
                  const on = p.id === selected;
                  return (
                    <button key={p.id} onClick={() => { setSelected(p.id); setExpanded(false); }}
                      className="text-left px-3 py-2 rounded-xl shrink-0"
                      style={{
                        width: 156, background: on ? T.ink : "#fff", color: on ? T.ivory : T.ink,
                        border: `1px solid ${on ? T.ink : T.line}`,
                      }}>
                      <div className="flex items-center justify-between">
                        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.14em", color: on ? T.goldSoft : T.gold }}>
                          {dayShort(p.dayLabel).toUpperCase()}
                        </span>
                        <span style={{ width: 7, height: 7, borderRadius: 999, background: f.status === "approved" ? T.emerald : f.status === "changes" ? T.maroon : (on ? "#5A5048" : T.line) }} />
                      </div>
                      <div className="mt-1 truncate" style={{ fontFamily: DISPLAY, fontSize: 14 }}>{p.fields.hook || p.theme}</div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: on ? "#B9AFA4" : T.muted, letterSpacing: "0.08em" }}>
                        POST {p.number} · {slotTime(p.slot)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {post && (
              <div className="grid gap-6 mt-2" style={{ gridTemplateColumns: "1fr" }}>
                {/* platform picker */}
                <div className="flex items-center gap-2 flex-wrap">
                  {PLATFORMS.map(({ id, label, Icon }) => (
                    <button key={id} onClick={() => setPlatform(id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                      style={{
                        background: platform === id ? T.ink : "#fff", color: platform === id ? T.ivory : T.muted,
                        border: `1px solid ${platform === id ? T.ink : T.line}`, fontSize: 12,
                      }}>
                      <Icon size={13} />{label}
                    </button>
                  ))}
                </div>

                {/* the mirror */}
                <div className="mx-auto w-full" style={{ maxWidth: 420 }}>
                  <div style={{ borderRadius: 30, padding: 7, background: pf.frame, boxShadow: "0 22px 45px -26px rgba(27,23,20,0.6)" }}>
                    <div className="overflow-hidden" style={{ borderRadius: 24, background: pf.page }}>
                      <div style={{ padding: platform === "instagram" ? 0 : 8 }}>
                        <div className="overflow-hidden" style={{ borderRadius: platform === "instagram" ? 0 : 10, background: "#fff" }}>
                          <Preview post={shown} brand={brand} img={images[post.id]} metrics={brand.metrics}
                            expanded={expanded} onExpand={() => setExpanded(true)} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-2 mt-2">
                      <input ref={imgRef} type="file" accept="image/*" className="hidden"
                        onChange={(e) => { const f = e.target.files[0]; if (f) attachImage(f, post.id); e.target.value = ""; }} />
                      <button onClick={() => imgRef.current && imgRef.current.click()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                        style={{ border: `1px solid ${T.line}`, background: "#fff", fontSize: 12 }}>
                        <ImageIcon size={13} />{images[post.id] ? "Replace image" : "Add image"}
                      </button>
                      {images[post.id] && (
                        <button onClick={() => removeImage(post.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                          style={{ border: `1px solid ${T.line}`, background: "#fff", fontSize: 12, color: T.maroon }}>
                          <Trash2 size={13} />Remove image
                        </button>
                      )}
                      {draft ? (
                        <button onClick={() => setDraft(null)} className="px-3 py-1.5 rounded-full"
                          style={{ border: `1px solid ${T.line}`, background: "#fff", fontSize: 12 }}>
                          Stop editing
                        </button>
                      ) : (
                        <button onClick={() => setDraft(fieldsToDraft(post))}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                          style={{ border: `1px solid ${T.line}`, background: "#fff", fontSize: 12 }}>
                          <Pencil size={13} />Edit post
                        </button>
                      )}
                      <button
                        onClick={() => (confirmDel ? removePost(post.id) : setConfirmDel(true))}
                        onBlur={() => setConfirmDel(false)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                        style={{
                          border: `1px solid ${confirmDel ? T.maroon : T.line}`,
                          background: confirmDel ? T.maroon : "#fff",
                          color: confirmDel ? "#fff" : T.maroon, fontSize: 12,
                        }}>
                        <Trash2 size={13} />{confirmDel ? "Tap again to delete" : "Delete post"}
                      </button>
                    </div>
                  )}
                </div>

                {/* details + notes */}
                <div>
                  {draft ? (
                    <PostEditor draft={draft} setDraft={setDraft} onSave={saveEdit}
                      onCancel={() => setDraft(null)} saving={saving} />
                  ) : (
                  <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Chip tone="gold">Post {post.number}</Chip>
                    {post.slot && <Chip>{post.slot}</Chip>}
                    {post.fields.type && <Chip>{post.fields.type}</Chip>}
                    {post.fields.format && <Chip>{post.fields.format}</Chip>}
                  </div>
                  <div className="mt-3" style={{ fontFamily: DISPLAY, fontSize: 22, lineHeight: 1.25 }}>{post.theme}</div>

                  <Section label="CAPTION" right={
                    <button onClick={() => copy([post.fields.caption, post.fields.tags.join(" ")].filter(Boolean).join("\n\n"), "Caption copied.")}
                      className="flex items-center gap-1" style={{ fontSize: 11, color: T.muted }}>
                      <Copy size={12} />Copy
                    </button>
                  }>
                    <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{post.fields.caption}</div>
                  </Section>

                  {post.fields.script && (
                    <Section label="SCRIPT">
                      <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{post.fields.script}</div>
                    </Section>
                  )}
                  {post.fields.screenText && (
                    <Section label="ON-SCREEN TEXT">
                      <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{post.fields.screenText}</div>
                    </Section>
                  )}
                  {post.fields.slides.length > 0 && (
                    <Section label={`SLIDES (${post.fields.slides.length})`}>
                      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}>
                        {post.fields.slides.map((s, i) => (
                          <div key={i} className="p-3 rounded-xl" style={{ background: "#fff", border: `1px solid ${T.line}`, fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                            <span style={{ fontFamily: MONO, fontSize: 9, color: T.gold }}>{String(i + 1).padStart(2, "0")}</span>
                            <div className="mt-1">{s}</div>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}
                  {post.fields.tags.length > 0 && (
                    <Section label={`HASHTAGS (${post.fields.tags.length})`} right={
                      <button onClick={() => copy(post.fields.tags.join(" "), "Hashtags copied.")} className="flex items-center gap-1" style={{ fontSize: 11, color: T.muted }}>
                        <Copy size={12} />Copy
                      </button>
                    }>
                      <div className="flex flex-wrap gap-1.5">
                        {post.fields.tags.map((t) => (
                          <span key={t} className="px-2 py-0.5 rounded-full" style={{ background: "#fff", border: `1px solid ${T.line}`, fontSize: 11, color: T.muted }}>{t}</span>
                        ))}
                      </div>
                    </Section>
                  )}
                  {post.fields.visual && (
                    <Section label="IMAGE BRIEF" right={
                      <button onClick={() => copy(post.fields.visual, "Image brief copied.")} className="flex items-center gap-1" style={{ fontSize: 11, color: T.muted }}>
                        <Copy size={12} />Copy
                      </button>
                    }>
                      <div className="p-3 rounded-xl" style={{ background: "#fff", border: `1px dashed ${T.line}`, fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", color: T.muted }}>
                        {post.fields.visual}
                      </div>
                    </Section>
                  )}

                  </>
                  )}

                  <NotesPanel
                    post={post} entry={fbFor(post.id)} me={me} setName={setName} isAdmin={isAdmin}
                    onStatus={(status) => saveFeedback(post.id, (e) => ({ ...e, status }))}
                    onAdd={(c) => saveFeedback(post.id, (e) => ({ ...e, comments: [...e.comments, c] }))}
                    onToggle={(cid) => saveFeedback(post.id, (e) => ({ ...e, comments: e.comments.map((c) => (c.id === cid ? { ...c, resolved: !c.resolved } : c)) }))}
                    onDelete={(cid) => saveFeedback(post.id, (e) => ({ ...e, comments: e.comments.filter((c) => c.id !== cid) }))}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------- brief */}
      {plan && tab === "brief" && (
        <div className="max-w-3xl mx-auto px-4 py-5">
          <div style={{ fontFamily: DISPLAY, fontSize: 26, lineHeight: 1.2 }}>{plan.title}</div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {plan.meta.map((m) => <Chip key={m.label} tone="gold">{m.label}: {m.value}</Chip>)}
          </div>
          <div className="mt-5 p-4 rounded-2xl" style={{ background: "#fff", border: `1px solid ${T.line}`, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {plan.brief.replace(/^##\s+/gm, "")}
          </div>
          {plan.appendix.map((a) => (
            <div key={a.heading} className="mt-4">
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: T.gold }}>{a.heading}</div>
              <div className="mt-2 p-4 rounded-2xl" style={{ background: "#fff", border: `1px solid ${T.line}`, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {a.body}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --------------------------------------------------------- upload */}
      {isAdmin && tab === "upload" && <UploadPanel onPublish={publish} fileRef={fileRef} plan={plan} images={images} onBulk={attachImage} onClear={clearEverything} onOpenPost={(id) => { setSelected(id); setTab("posts"); }} onDeletePost={removePost} brand={brand} brandCfg={brandCfg} onSaveBrand={saveBrand} />}

      {/* --------------------------------------------------------- digest */}
      {isAdmin && tab === "digest" && plan && (
        <div className="max-w-3xl mx-auto px-4 py-5">
          <div className="flex items-center justify-between">
            <div style={{ fontFamily: DISPLAY, fontSize: 22 }}>Client feedback</div>
            <button onClick={() => copy(digest(), "Feedback copied as markdown.")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ border: `1px solid ${T.line}`, background: "#fff", fontSize: 12 }}>
              <ClipboardList size={13} />Copy all
            </button>
          </div>
          {plan.posts.map((p) => {
            const f = fbFor(p.id);
            const open = (f.comments || []).filter((c) => !c.resolved);
            if (f.status === "pending" && !open.length) return null;
            return (
              <div key={p.id} className="mt-3 p-4 rounded-2xl" style={{ background: "#fff", border: `1px solid ${T.line}` }}>
                <div className="flex items-center justify-between gap-2">
                  <button onClick={() => { setSelected(p.id); setTab("posts"); }} style={{ fontFamily: DISPLAY, fontSize: 16, textAlign: "left" }}>
                    Post {p.number} · {dayShort(p.dayLabel)}
                  </button>
                  <Chip tone={f.status === "approved" ? "green" : f.status === "changes" ? "maroon" : "neutral"}>{f.status}</Chip>
                </div>
                {open.map((c) => (
                  <div key={c.id} className="mt-2" style={{ fontSize: 13, lineHeight: 1.5 }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: T.gold, letterSpacing: "0.1em" }}>{c.kind.toUpperCase()} </span>
                    <span style={{ fontWeight: 600 }}>{c.author}: </span>{c.text}
                  </div>
                ))}
              </div>
            );
          })}
          {!openCount && <p className="mt-4" style={{ fontSize: 13, color: T.muted }}>No open notes. Everything is either untouched or resolved.</p>}
        </div>
      )}

      {toast && (
        <div className="fixed left-1/2 bottom-6 z-40 px-4 py-2.5 rounded-full" style={{ transform: "translateX(-50%)", background: T.ink, color: T.ivory, fontSize: 13, maxWidth: "90vw" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ notes panel */
const KINDS = ["Add", "Remove", "Change", "Note"];

function NotesPanel({ post, entry, me, setName, isAdmin, onStatus, onAdd, onToggle, onDelete }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState("Change");
  const [name, setNameLocal] = useState(me.name);
  useEffect(() => setNameLocal(me.name), [me.name]);

  const submit = () => {
    const author = (name || "").trim() || "Client";
    if (!text.trim()) return;
    if (author !== me.name) setName(author);
    onAdd({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, author, kind, text: text.trim(), ts: new Date().toISOString(), resolved: false, admin: isAdmin });
    setText("");
  };

  return (
    <Section label="NOTES ON THIS POST">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Chip tone="green" active={entry.status === "approved"} onClick={() => onStatus(entry.status === "approved" ? "pending" : "approved")}>
          Approve
        </Chip>
        <Chip tone="maroon" active={entry.status === "changes"} onClick={() => onStatus(entry.status === "changes" ? "pending" : "changes")}>
          Needs changes
        </Chip>
      </div>

      {(entry.comments || []).map((c) => (
        <div key={c.id} className="p-3 rounded-xl mb-2" style={{ background: "#fff", border: `1px solid ${T.line}`, opacity: c.resolved ? 0.55 : 1 }}>
          <div className="flex items-center gap-2">
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", color: c.kind === "Remove" ? T.maroon : T.gold }}>{c.kind.toUpperCase()}</span>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{c.author}</span>
            <span style={{ fontSize: 11, color: T.muted }}>{new Date(c.ts).toLocaleDateString()}</span>
            <div className="flex-1" />
            <button onClick={() => onToggle(c.id)} title={c.resolved ? "Reopen" : "Mark done"} style={{ color: c.resolved ? T.emerald : T.muted }}>
              <Check size={15} />
            </button>
            <button onClick={() => onDelete(c.id)} title="Delete" style={{ color: T.muted }}><X size={15} /></button>
          </div>
          <div className="mt-1.5" style={{ fontSize: 13, lineHeight: 1.5, textDecoration: c.resolved ? "line-through" : "none" }}>{c.text}</div>
        </div>
      ))}

      <div className="p-3 rounded-xl" style={{ background: "#fff", border: `1px solid ${T.line}` }}>
        <div className="flex gap-1.5 mb-2 flex-wrap">
          {KINDS.map((k) => <Chip key={k} active={kind === k} onClick={() => setKind(k)}>{k}</Chip>)}
        </div>
        <textarea
          value={text} onChange={(e) => setText(e.target.value)} rows={3}
          placeholder={kind === "Remove" ? "What should come out of this post?" : "What would you like changed?"}
          className="w-full px-3 py-2 rounded-lg" style={{ border: `1px solid ${T.line}`, fontSize: 14, resize: "vertical" }}
        />
        <div className="flex items-center gap-2 mt-2">
          <input value={name} onChange={(e) => setNameLocal(e.target.value)} placeholder="Your name"
            className="px-3 py-2 rounded-lg flex-1 min-w-0" style={{ border: `1px solid ${T.line}`, fontSize: 13 }} />
          <button onClick={submit} className="px-4 py-2 rounded-lg" style={{ background: T.ink, color: T.ivory, fontSize: 13 }}>Add note</button>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------ brand panel */
/* Pull the dominant colours out of a logo so the portal can match it. */
function sampleColours(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = 48;
      const c = document.createElement("canvas");
      c.width = size; c.height = size;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, size, size);
      let data;
      try { data = ctx.getImageData(0, 0, size, size).data; } catch (e) { resolve([]); return; }
      const buckets = new Map();
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 200) continue;
        if (r > 244 && g > 244 && b > 244) continue;
        const key = `${Math.round(r / 24)}-${Math.round(g / 24)}-${Math.round(b / 24)}`;
        const prev = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0 };
        buckets.set(key, { r: prev.r + r, g: prev.g + g, b: prev.b + b, n: prev.n + 1 });
      }
      const hex = (v) => v.toString(16).padStart(2, "0");
      resolve(
        [...buckets.values()]
          .sort((a, b) => b.n - a.n)
          .slice(0, 6)
          .map((x) => `#${hex(Math.round(x.r / x.n))}${hex(Math.round(x.g / x.n))}${hex(Math.round(x.b / x.n))}`)
      );
    };
    img.onerror = () => resolve([]);
    img.src = dataUrl;
  });
}

function Swatch({ label, value, onChange }) {
  return (
    <div className="flex items-center gap-3 mt-2">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: 42, height: 34, border: `1px solid ${T.line}`, borderRadius: 8, background: "#fff", padding: 2 }} />
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 13 }}>{label}</div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: T.muted }}>{value}</div>
      </div>
    </div>
  );
}

function BrandPanel({ brand, brandCfg, onSave }) {
  const [d, setD] = useState({
    name: brandCfg.name || brand.name || "",
    handle: brandCfg.handle || brand.handle || "",
    tagline: brandCfg.tagline || brand.tagline || "",
    city: brandCfg.city || brand.city || "",
    site: brandCfg.site || brand.site || "",
    logo: brandCfg.logo || "",
    verified: Boolean(brandCfg.verified),
    brandRing: Boolean(brandCfg.brandRing),
    metrics: brandCfg.metrics !== false,
    accent: brandCfg.accent || brand.accent,
    deep: brandCfg.deep || brand.deep,
  });
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const logoRef = useRef(null);
  const set = (k) => (v) => setD((x) => ({ ...x, [k]: v }));

  const onLogo = async (file) => {
    setBusy(true);
    try {
      const dataUrl = await compress(file, 320, 0.92, "image/png");
      setD((x) => ({ ...x, logo: dataUrl }));
      setPicked(await sampleColours(dataUrl));
    } catch (e) { /* leave the previous logo in place */ }
    setBusy(false);
  };

  return (
    <div className="mt-8">
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: T.gold }}>BRAND</div>
      <p className="mt-2" style={{ fontSize: 13, color: T.muted, lineHeight: 1.55 }}>
        The logo and name appear in every preview. Colours carry through the profile picture, the placeholder art and the
        story ring. Each platform keeps its own chrome, which is what makes the preview honest.
      </p>

      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <div className="overflow-hidden shrink-0" style={{ width: 56, height: 56, borderRadius: 999, border: `1px solid ${T.line}`, background: "#fff" }}>
          {d.logo
            ? <img src={d.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <div className="w-full h-full flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${d.deep}, ${d.accent})`, color: "#fff", fontFamily: DISPLAY }}>
                {initials(d.name || "B")}
              </div>}
        </div>
        <input ref={logoRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files[0]; if (f) onLogo(f); e.target.value = ""; }} />
        <button onClick={() => logoRef.current && logoRef.current.click()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
          style={{ background: "#fff", border: `1px solid ${T.line}`, fontSize: 13 }}>
          <ImageIcon size={14} />{busy ? "Reading" : d.logo ? "Replace logo" : "Upload logo"}
        </button>
        {d.logo && (
          <button onClick={() => { setD((x) => ({ ...x, logo: "" })); setPicked([]); }} className="px-3 py-2 rounded-lg"
            style={{ background: "#fff", border: `1px solid ${T.line}`, fontSize: 13, color: T.maroon }}>
            Remove
          </button>
        )}
      </div>

      {picked.length > 0 && (
        <div className="mt-3">
          <div style={{ fontSize: 12, color: T.muted }}>Pulled from your logo. Tap one to use it as the accent.</div>
          <div className="flex gap-2 mt-2 flex-wrap">
            {picked.map((c) => (
              <button key={c} onClick={() => setD((x) => ({ ...x, accent: c }))} title={c}
                style={{ width: 34, height: 34, borderRadius: 8, background: c, border: `1px solid ${T.line}` }} />
            ))}
          </div>
        </div>
      )}

      <Field label="DISPLAY NAME" value={d.name} onChange={set("name")} rows={1} />
      <Field label="HANDLE (INSTAGRAM)" value={d.handle} onChange={set("handle")} rows={1} />
      <Field label="TAGLINE (LINKEDIN SUBHEADING)" value={d.tagline} onChange={set("tagline")} rows={1} />
      <Field label="LOCATION LINE (INSTAGRAM)" value={d.city} onChange={set("city")} rows={1} />
      <Field label="WEBSITE (PINTEREST SOURCE)" value={d.site} onChange={set("site")} rows={1} />

      <div className="mt-4">
        <Swatch label="Accent" value={d.accent} onChange={set("accent")} />
        <Swatch label="Deep tone" value={d.deep} onChange={set("deep")} />
      </div>

      <label className="flex items-center gap-2 mt-4" style={{ fontSize: 13 }}>
        <input type="checkbox" checked={d.verified} onChange={(e) => set("verified")(e.target.checked)} />
        Show a verified tick in previews
      </label>
      <label className="flex items-center gap-2 mt-2" style={{ fontSize: 13 }}>
        <input type="checkbox" checked={d.brandRing} onChange={(e) => set("brandRing")(e.target.checked)} />
        Brand colours for the Instagram story ring instead of the Instagram gradient
      </label>
      <label className="flex items-center gap-2 mt-2" style={{ fontSize: 13 }}>
        <input type="checkbox" checked={d.metrics} onChange={(e) => set("metrics")(e.target.checked)} />
        Show sample likes and comments (illustrative only, not real numbers)
      </label>

      <button onClick={() => onSave(d)} className="px-4 py-2 rounded-lg mt-4"
        style={{ background: T.ink, color: T.ivory, fontSize: 13 }}>
        Save brand settings
      </button>
    </div>
  );
}

/* ----------------------------------------------------------- upload panel */
function UploadPanel({ onPublish, fileRef, plan, images, onBulk, onClear, onOpenPost, onDeletePost, brand, brandCfg, onSaveBrand }) {
  const [text, setText] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [pendingId, setPendingId] = useState(null);
  const bulkRef = useRef(null);

  const readFile = (file) => {
    const r = new FileReader();
    r.onload = () => setText(String(r.result));
    r.readAsText(file);
  };

  const missing = plan ? plan.posts.filter((p) => !images[p.id]) : [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      <div style={{ fontFamily: DISPLAY, fontSize: 22 }}>Upload a content plan</div>
      <p className="mt-2" style={{ fontSize: 13, color: T.muted, lineHeight: 1.55 }}>
        Markdown with day headings like <code>{"# MONDAY — 7 SEPTEMBER"}</code> and post headings like <code>{"### POST 1 — MORNING"}</code>.
        Publishing replaces the plan. Notes stay attached to matching post numbers.
      </p>

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <input ref={fileRef} type="file" accept=".md,.markdown,.txt" className="hidden"
          onChange={(e) => { const f = e.target.files[0]; if (f) readFile(f); e.target.value = ""; }} />
        <button onClick={() => fileRef.current && fileRef.current.click()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
          style={{ background: "#fff", border: `1px solid ${T.line}`, fontSize: 13 }}>
          <Upload size={14} />Choose .md file
        </button>
        <button onClick={() => onPublish(text)} className="px-4 py-2 rounded-lg" style={{ background: T.ink, color: T.ivory, fontSize: 13 }}>
          Publish to client view
        </button>
      </div>

      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12}
        placeholder="Or paste the markdown here"
        className="w-full mt-3 px-3 py-3 rounded-xl" style={{ border: `1px solid ${T.line}`, fontFamily: MONO, fontSize: 12, lineHeight: 1.5, resize: "vertical" }} />

      {plan && (
        <div className="mt-6">
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: T.gold }}>IMAGES</div>
          <p className="mt-2" style={{ fontSize: 13, color: T.muted }}>
            {plan.posts.length - missing.length} of {plan.posts.length} posts have an image.
            {missing.length > 0 && " Bulk upload fills the earliest empty posts in order."}
          </p>
          <input ref={bulkRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              files.forEach((f, i) => { if (missing[i]) onBulk(f, missing[i].id); });
              e.target.value = "";
            }} />
          <button onClick={() => bulkRef.current && bulkRef.current.click()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg mt-2"
            style={{ background: "#fff", border: `1px solid ${T.line}`, fontSize: 13 }}>
            <ImageIcon size={14} />Add images in order
          </button>
          <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(84px,1fr))" }}>
            {plan.posts.map((p) => (
              <div key={p.id} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${T.line}`, aspectRatio: "4 / 5", background: T.champagne }}>
                {images[p.id]
                  ? <img src={images[p.id]} alt="" className="w-full h-full" style={{ objectFit: "cover" }} />
                  : <div className="w-full h-full flex items-center justify-center" style={{ fontFamily: MONO, fontSize: 10, color: T.gold }}>{p.number}</div>}
              </div>
            ))}
          </div>

          <div className="mt-8">
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: T.gold }}>POSTS</div>
            <p className="mt-2" style={{ fontSize: 13, color: T.muted }}>
              Open a post to edit its caption, or remove it from the plan. Removing a post also drops its image and its notes.
            </p>
            {plan.posts.map((p) => (
              <div key={p.id} className="flex items-center gap-2 mt-2 p-3 rounded-xl" style={{ background: "#fff", border: `1px solid ${T.line}` }}>
                <div className="min-w-0 flex-1">
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", color: T.gold }}>
                    POST {p.number} · {dayShort(p.dayLabel).toUpperCase()}
                  </div>
                  <div className="truncate" style={{ fontFamily: DISPLAY, fontSize: 15 }}>{p.fields.hook || p.theme}</div>
                </div>
                <button onClick={() => onOpenPost(p.id)} className="px-3 py-1.5 rounded-full shrink-0"
                  style={{ border: `1px solid ${T.line}`, fontSize: 12 }}>
                  Open
                </button>
                <button
                  onClick={() => (pendingId === p.id ? (onDeletePost(p.id), setPendingId(null)) : setPendingId(p.id))}
                  onBlur={() => setPendingId(null)}
                  className="px-3 py-1.5 rounded-full shrink-0"
                  style={{
                    border: `1px solid ${pendingId === p.id ? T.maroon : T.line}`,
                    background: pendingId === p.id ? T.maroon : "#fff",
                    color: pendingId === p.id ? "#fff" : T.maroon, fontSize: 12,
                  }}>
                  {pendingId === p.id ? "Confirm" : "Remove"}
                </button>
              </div>
            ))}
          </div>

          <BrandPanel brand={brand} brandCfg={brandCfg} onSave={onSaveBrand} />

          <div className="mt-8 p-4 rounded-2xl" style={{ background: "#fff", border: `1px solid ${T.maroon}` }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 18, color: T.maroon }}>Clear everything</div>
            <p className="mt-1" style={{ fontSize: 13, color: T.muted, lineHeight: 1.55 }}>
              Deletes the plan, every image and every client note. This cannot be undone. Type CLEAR to enable the button.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="CLEAR"
                className="px-3 py-2 rounded-lg flex-1 min-w-0" style={{ border: `1px solid ${T.line}`, fontSize: 13 }} />
              <button
                onClick={() => { onClear(); setConfirmText(""); }}
                disabled={confirmText.trim().toUpperCase() !== "CLEAR"}
                className="px-4 py-2 rounded-lg shrink-0"
                style={{
                  background: confirmText.trim().toUpperCase() === "CLEAR" ? T.maroon : "#EFEAE2",
                  color: confirmText.trim().toUpperCase() === "CLEAR" ? "#fff" : T.muted, fontSize: 13,
                }}>
                Clear everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------- image compress */
function compress(file, max = 1280, quality = 0.78, type = "image/jpeg") {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL(type, quality));
      };
      img.onerror = () => reject(new Error("bad image"));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}
