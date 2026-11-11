(function(root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./atlas-core.js') : root.StoryWeaveAtlasCore);
  if (root) root.StoryWeaveGeneratorCore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? null : window, function(Atlas) {
  'use strict';
  const templates = {continents:'大陆与海洋', archipelago:'群岛', highIsland:'山地岛屿',
    pangea:'超级大陆', mediterranean:'内海', peninsula:'半岛', volcano:'火山岛'};
  function config(raw) {
    const seed = String(raw.seed || '').trim();
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(seed)) throw Error('种子须为 1–40 位字母、数字、短横线或下划线');
    if (!Object.hasOwn(templates, raw.template)) throw Error('不支持的地形模板');
    if (!['physical','political'].includes(raw.style)) throw Error('不支持的地图样式');
    return {seed,template:raw.template,style:raw.style};
  }
  function validate(result, expected) {
    if (!result || result.engine !== 'Azgaar 1.109.1' || result.width !== 1200 || result.height !== 800) throw Error('生成结果格式无效');
    const settings = config(result);
    for (const key of ['seed','template','style']) if (settings[key] !== expected[key]) throw Error('生成结果与当前设置不一致');
    const map = Atlas.validMap({...result,id:'preview',title:'生成预览',mode:'fiction'},'preview');
    if (!map.image) throw Error('生成结果缺少地图图片');
    if (!Array.isArray(result.settlements) || result.settlements.length > 200) throw Error('城镇数据无效');
    const settlements = result.settlements.map(row => {
      const place = Atlas.validPlace({id:'preview',mapId:map.id,name:row.name,position:{x:row.x,y:row.y}},map,'preview');
      return {name:place.name,x:place.position.x,y:place.position.y,capital:!!row.capital,port:!!row.port,
        country:typeof row.country === 'string' ? row.country.trim().slice(0,150) : ''};
    });
    return {...settings, engine:result.engine, width:map.width,height:map.height,image:map.image,settlements};
  }
  function build(result, title, projectId, nextId, includePlaces) {
    const checked = validate(result,config(result));
    const map = Atlas.validMap({...checked,id:nextId(),title,mode:'fiction',
      generation:{engine:checked.engine,seed:checked.seed,template:checked.template,style:checked.style}},projectId);
    const places = includePlaces ? checked.settlements.map(row => Atlas.validPlace({id:nextId(),mapId:map.id,
      name:row.name,type:row.port ? '港口' : '城市',position:{x:row.x,y:row.y},
      description:[row.capital ? '生成时为首都。' : '',row.country ? '生成时所属国家：'+row.country+'。' : '',
        '由地图生成器提出，名称与设定可由作者修改。'].filter(Boolean).join('\n')},map,projectId)) : [];
    return {map,places};
  }
  return {templates,config,validate,build};
});
