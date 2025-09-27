*/
(function () {
  if (app.documents.length === 0) { alert("Open a document first."); return; }
  var doc = app.activeDocument;

  // ===== CONFIG =====
  var PREFIX   = "day_";
  var PAD      = 3;        // 001, 002...
  var TARGETPX = 1080;     // long side
  var LIMIT    = 364;      // quante immagini generare (0 = tutte)

  // ===== COLLECT ITEMS (deep) =====
  var all = [];
  if (doc.selection && doc.selection.length > 0) {
    for (var i=0;i<doc.selection.length;i++) collectDeep(doc.selection[i], all);
  } else {
    // fallback: tutto il doc
    for (var L=0; L<doc.layers.length; L++) scanLayer(doc.layers[L], all);
  }
  if (all.length === 0) { alert("Nothing found. Tip: Select > Same > Fill Color, then run again."); return; }

  // Artboard attiva
  var abIndex = doc.artboards.getActiveArtboardIndex();
  var abRect  = doc.artboards[abIndex].artboardRect;

  // Trova lo sfondo più grande (coverage > 60% dell'artboard)
  var abArea = area(abRect);
  var maxI = -1, maxA = -1;
  for (var k=0;k<all.length;k++){
    var a = area(all[k].vb);
    if (a > maxA){ maxA = a; maxI = k; }
  }
  var bg = null;
  if (maxI >= 0 && (maxA/abArea) > 0.60) {
    bg = all[maxI].item;         // candidato sfondo
    all.splice(maxI,1);          // rimuovilo dall’elenco dei pixel
  }

  if (all.length === 0) { alert("Only background detected. Riprova selezionando i pixel."); return; }

  // Mescola l'ordine dei pixel
  shuffle(all);

  // Limite passi
  var steps = (LIMIT > 0) ? Math.min(LIMIT, all.length) : all.length;

  // Cartella destinazione
  var dest = Folder.selectDialog("Scegli la cartella per i PNG 1080");
  if (!dest) { alert("Export canceled."); return; }

  // Ricorda visibilità
  var bgWasHidden = (bg ? bg.hidden : false);
  var origHidden = [];
  for (var p=0;p<all.length;p++) origHidden[p] = all[p].item.hidden;

  // Nascondi sfondo per l'intera sequenza (per ottenere buchi/trasparenza o rivelare il layer sotto)
  if (bg) bg.hidden = true;

  // Export loop
  var ok=0, err=0;
  for (var s=0; s<steps; s++){
    try{
      all[s].item.hidden = true; // nasconde un pixel in più

      var scale = scaleForTargetPx(abRect, TARGETPX);
      var num = (s+1).toString(); while (num.length < PAD) num = "0"+num;
      var out = new File(dest.fsName + "/" + PREFIX + num + ".png");

      doc.exportFile(out, ExportType.PNG24, pngOpts(scale));
      ok++;
    } catch(e){ err++; }
  }

  // Ripristina visibilità
  for (var r=0;r<all.length;r++) all[r].item.hidden = origHidden[r];
  if (bg) bg.hidden = bgWasHidden;

  alert("Fatto. PNG esportati: " + ok + (err ? (" | Errori: " + err) : "") + "\nCartella: " + dest.fsName);

  // ===== Helpers =====
  function collectDeep(pi, out){
    if (!pi || pi.hidden || pi.guides) return;
    var t = pi.typename;
    if (t === "PathItem") {
      push(pi, out);
    } else if (t === "CompoundPathItem") {
      for (var i=0;i<pi.pathItems.length;i++) collectDeep(pi.pathItems[i], out);
    } else if (t === "GroupItem") {
      for (var j=0;j<pi.pageItems.length;j++) collectDeep(pi.pageItems[j], out);
    } else {
      try { if (pi.visibleBounds) push(pi, out); } catch(e){}
    }
  }
  function scanLayer(lay, out){
    if (!lay.visible) return;
    for (var i=0;i<lay.pageItems.length;i++) collectDeep(lay.pageItems[i], out);
    for (var j=0;j<lay.layers.length;j++) scanLayer(lay.layers[j], out);
  }
  function push(pi, outArr){
    try{
      var vb = pi.visibleBounds; // [L,T,R,B]
      if (!vb) return;
      var w = vb[2]-vb[0], h = vb[1]-vb[3];
      if (w > 0.01 && h > 0.01) outArr.push({item:pi, vb:vb});
    }catch(e){}
  }
  function shuffle(arr){
    for (var i=arr.length-1;i>0;i--){
      var j = Math.floor(Math.random()*(i+1));
      var t = arr[i]; arr[i]=arr[j]; arr[j]=t;
    }
  }
  function area(r){ return Math.max(0,(r[2]-r[0])*(r[1]-r[3])); }
  function scaleForTargetPx(rect, targetPx){
    var w = rect[2]-rect[0], h = rect[1]-rect[3];
    var longSide = Math.max(w,h); if (longSide<=0) return 100;
    return (targetPx/longSide)*100.0;
  }
  function pngOpts(scale){
    var o = new ExportOptionsPNG24();
    o.transparency = true; o.antiAliasing = true; o.artBoardClipping = true;
    var p = Math.max(0.1, Math.round(scale*100)/100);
    o.horizontalScale = p; o.verticalScale = p; return o;
  }
