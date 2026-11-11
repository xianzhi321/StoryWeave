// StoryWeave adapter for Azgaar v1.109.1. Runs inside an isolated, offline iframe.
'use strict';
document.addEventListener('DOMContentLoaded', async () => {
  let url;
  try {
    storyWeaveReport('progress', {message:'正在生成地形、河流、国家与城镇…'});
    await applyStyleOnLoad();
    await generate();
    if (!pack.burgs?.length || !pack.cells?.h?.length) throw Error('生成引擎未返回完整地图');
    applyLayersPreset();
    // Names and towns are editable StoryWeave markers, never baked into the image.
    for (const layer of ['toggleLabels','toggleIcons','toggleCoordinates','toggleScaleBar','toggleEmblems']) {
      byId(layer)?.classList.add('buttonoff');
    }
    drawLayers();
    // All textures are local; use a solid ocean for a self-contained SVG rasterization.
    byId('oceanPattern')?.remove();
    byId('oceanicPattern')?.remove();
    byId('texture')?.replaceChildren();
    storyWeaveReport('progress', {message:'正在绘制地图预览…'});
    url = await getMapURL('svg', {fullMap:true, noLabels:true, noScaleBar:true});
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(Error('地图图片绘制失败'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = graphWidth; canvas.height = graphHeight;
    canvas.getContext('2d').drawImage(img,0,0);
    const settlements = pack.burgs.filter(b => b.i && !b.removed).map(b => ({
      name:b.name, x:b.x, y:b.y, capital:!!b.capital, port:!!b.port,
      country:pack.states[b.state]?.fullName || pack.states[b.state]?.name || ''
    }));
    storyWeaveReport('result', {result:{engine:'Azgaar 1.109.1', seed:String(seed),
      template:byId('templateInput').value, style:localStorage.getItem('preset'),
      width:graphWidth,height:graphHeight,image:canvas.toDataURL('image/png'),settlements}});
  } catch (error) {
    storyWeaveReport('error',{message:error.message || String(error)});
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
});
