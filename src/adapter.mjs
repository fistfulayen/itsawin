// Compatibility layer for one inspected artwork build. Never rewrite tty.mjs:
// apply uniquely anchored edits to a generated copy after verifying its hash.
import { createHash } from "node:crypto";
export const SOURCE_HASH =
  "ce1bed685670b04fbc52421567aff17f7b54e559ab44ebc8ea9129bc80d057f2";
export function adapt(source, pluginUrl) {
  const hash = createHash("sha256").update(source).digest("hex");
  if (hash !== SOURCE_HASH)
    throw new Error(
      `Unsupported artwork client (${hash}). Expected the inspected tty.mjs version; original file left unchanged.`,
    );
  function replace(before, after) {
    if (
      !source.includes(before) ||
      source.indexOf(before) !== source.lastIndexOf(before)
    )
      throw new Error(
        `Artwork adapter anchor is not unique: ${before.slice(0, 65)}`,
      );
    source = source.replace(before, after);
  }
  replace("const oi=await", "const WinLine=G;const oi=await");
  replace(
    "let N=Xs(s,s.seed,s.theme)",
    'let N=Xs(s,s.seed,Object.keys(As).indexOf(process.env.WIN_THEME||"p1"))',
  );
  replace("this.bt=new Uint8Array(t)", "this.bt=new Uint32Array(t)");
  replace(
    'new Ot("~N~ew",106,"F4",0,"F4"),It()',
    'new Ot("~N~ew",106,"F4",0,"F4"),new Ot("~C~onnect session...",120),It()',
  );
  replace(
    "if(e.kn&&e.kn(h.message.command,et))",
    "if(h.message.command===120?(winPlugin.choose(),true):e.kn&&e.kn(h.message.command,et))",
  );
  replace(
    "Nt:()=>new j(_.x,_.y)};return{loop:",
    `Nt:()=>new j(_.x,_.y)};winPlugin=installWin({Window:Et,View:nt,Rect:V,Point:j,Line:WinLine,palettes:As,desktop:()=>Y.screen?.ih,menuActive:()=>!!Y.screen?.hh?.fi,key:(keyCode,charCode)=>G(J,Y,{xt:D,Nt:null,Et:{keyCode,charCode},message:null}),command:command=>G(J,Y,{xt:x,Nt:null,Et:null,message:{command,vt:null}}),mouse:event=>{const {button:b,x:mx,y:my,up}=event;_.x=mx;_.y=my;const point=new j(mx,my);if(b&64)G(J,Y,it(32,point,b&1?2:1));else if(b&32)G(J,Y,it(4,point));else if(up){_.buttons=0;G(J,Y,it(2,point))}else{_.buttons=1;_.Sn=performance.now()+440;G(J,Y,it(1,point))}},quit:()=>ri(0)});return{loop:`,
  );
  replace("e.screen.idle(),e.bn", "e.screen.idle(),winPlugin.tick(),e.bn");
  replace(
    "const i=s[15&t],e=s[t>>4&15];return",
    "const [i,e]=winPlugin.colors(t,s);return",
  );
  replace(
    "function ri(t){ei.write(",
    'function ri(t){winPlugin?.dispose();ei.write("\\x1b[?2004l");ei.write(',
  );
  replace(
    'process.on("SIGTERM",()=>ri(0))',
    'process.on("SIGINT",()=>ri(0)),process.on("SIGHUP",()=>ri(0)),process.on("SIGTERM",()=>ri(0))',
  );
  replace(
    'ii.setRawMode(!0),ii.setEncoding("utf8");',
    'ii.setRawMode(!0),ii.setEncoding("utf8"),ei.write("\\x1b[?2004h");',
  );
  const start = source.indexOf('ii.on("data",t=>function(');
  const end = source.indexOf(";const ci=", start);
  if (start < 0 || end < 0) throw new Error("Input adapter anchor missing");
  source =
    source.slice(0, start) +
    'ii.on("data",t=>winPlugin.input(t))' +
    source.slice(end);
  return (
    `import { install as installWin } from ${JSON.stringify(pluginUrl)};\nlet winPlugin;\n` +
    source
  );
}
