/* Model Probe: dependency-free judging rules; Node.js and browser compatible. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ModelProbe = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '1.3.1';
  const prompts = {
    candy: '在一个黑色的袋子里放有三种口味的糖果，每种糖果有两种不同的形状（圆形和五角星形，不同的形状靠手感可以分辨）。现已知不同口味的糖和不同形状的数量统计如下表。参赛者需要在活动前决定摸出的糖果数目，那么，最少取出多少个糖果才能保证手中同时拥有不同形状的苹果味和桃子味的糖？（同时手中有圆形苹果味匹配五角星桃子味糖果，或者有圆形桃子味匹配五角星苹果味糖果都满足要求）\n\n| 形状 | 苹果味 | 桃子味 | 西瓜味 |\n| 圆形 | 7 | 9 | 8 |\n| 五角星形 | 7 | 6 | 4 |\n\n不许联网自己计算',
    pelican: '创建一个HTML，内容是SVG绘制一个剃鹕骑自行车的2D动画，你不需要任何测试'
  };
  const standard = '可以凭手感选形状时，最少21颗：9颗圆形＋12颗五角星形。圆形西瓜味只有8颗，所以9颗圆形必有苹果味或桃子味。五角星形非苹果味共10颗，非桃子味共11颗，所以12颗五角星形必有苹果味和桃子味。20颗不够：圆形≤8颗时可全为西瓜味；圆形9～15颗时，两种形状都可只含苹果味和西瓜味；圆形≥16颗时，五角星形≤4颗，可全为西瓜味。若不允许选形状而任意抓取，则最少29颗。';
  const labels = { pass: '结论符合', fail: '结论不符', review: '结论不确定', artifact: '作品已提取', error: '请求失败' };
  function normalize(text) {
    return String(text || '').replace(/\\(?:boxed|mathbf|textbf|mathrm)\{([^{}]*)\}/g, '$1').replace(/[*#$`]/g, '').replace(/二十一/g, '21').replace(/二十九/g, '29').replace(/２０/g, '20').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 65248));
  }
  function candy(text,spec) {
    const expected=Number.isInteger(spec?.expected)?spec.expected:21;
    const failures=spec?.failures||[[8,17],[15,11],[17,10],[24,4]];
    const counts=spec?.counts||[[7,9,8],[7,6,4]];
    const chineseNumber=value=>{
      const digits={'零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
      if(value.includes('十')){const [a,b]=value.split('十');return (a?digits[a]:1)*10+(b?digits[b]:0)}
      return digits[value]??value;
    };
    const clean=normalize(text).replace(/\\[()[\]]/g,'').replace(/\\(?:text|mathrm)\{([^{}]*)\}/g,'$1').replace(/＝/g,'=').replace(/[零〇一二两三四五六七八九]?十[零〇一二两三四五六七八九]?|[零〇一二两三四五六七八九](?=\s*(?:颗|粒|个))/g,m=>String(chineseNumber(m)));
    const values=[],ignored=[],schemes=[],conclusions=[],applicable=[];
    const sentences=clean.split(/[。！!？?；;\n]+/).map(x=>x.trim()).filter(Boolean);
    const blindRe=/(?:不能|不允许|不可|无法|不能够)[^，,]{0,16}(?:挑|选|分辨)[^，,]{0,8}形状|(?:不能|不允许|不可|无法)[^，,]{0,10}形状[^，,]{0,8}(?:挑|选)|(?:完全|纯粹|只能|随机|任意|直接|不加选择)[^，,]{0,7}(?:抓取|抽取|摸取|取出|地取|取糖)|不(?:按|挑|选)形状/;
    const marker=/(?:答案|结论|最少|至少|最小|需要(?:取出|摸出|抽取)?|总共|总计|合计|共计|总数|共|minimum(?:\s+number)?|at\s+least|answer|total)(?:[^0-9。；\n]{0,28})([0-9]+(?:\.[0-9]+)?)/gi;
    for(const sentence of sentences){
      const clauses=sentence.split(/(?:但(?:是)?|而(?=是)|however|but)/i);
      for(const clause of clauses){
        const blind=blindRe.test(clause);
        if(!blind)applicable.push(clause);
        for(const match of clause.matchAll(marker)){
          const prefix=match[0].slice(0,match[0].lastIndexOf(match[1]));
          const after=clause.slice(match.index+match[0].length);
          const before=clause.slice(Math.max(0,match.index-12),match.index);
          // Quantities for one shape are construction details, not the total.
          if(/^\s*(?:颗|个|粒)?\s*(?:的)?(?:圆形|五角星形?|星形)/.test(after))continue;
          if(/(?:圆形|五角星|星形|苹果|桃子|西瓜)/.test(prefix))continue;
          if(/(?:不超过|不多于|少于|大于|至多|假设|假定|设为)/.test(prefix))continue;
          if(/(?:设|假设|假定|由|若|如果)[^，,。]{0,10}$/.test(before)&&/^(?:总数|总共|合计|共)/.test(match[0]))continue;
          if(/^\s*(?:颗|个|粒)?\s*(?:的)?(?:苹果|桃子|西瓜|口味)/.test(after))continue;
          if(/(?:圆形|五角星|星形|苹果|桃子|西瓜|袋中|袋内|袋子里)[^0-9，,。]{0,25}(?:共有?|总计|总数|合计)/.test(clause.slice(0,match.index+prefix.length).split(/[，,]/).at(-1)))continue;
          if(/^(?:至少|at\s+least)/i.test(match[0])&&/有|包含|含有/.test(prefix))continue;
          if(/(?:圆形|五角星形?|星形)[^，,。]{0,5}$/.test(before))continue;
          if(/(?:不是|并非|不为|不等于|不应是|不能是|不是说)\s*$/.test(prefix))continue;
          if(/^\s*(?:颗|个|粒)?\s*(?:是不对|是错误|不正确|不够|不足|无法保证|不能保证)/.test(after))continue;
          if(/^\s*(?:颗|个|粒)[^0-9。；]{0,18}(?:不能保证|无法保证|不能配对|不满足)/.test(after))continue;
          if(/^\s*[+＋]/.test(after)){
            const sum=after.match(/^\s*[+＋]\s*(\d+)\s*=\s*(\d+)/);
            if(sum&&Number(match[1])+Number(sum[1])===Number(sum[2]))(blind?ignored:values).push(Number(sum[2]));
            continue;
          }
          (blind?ignored:values).push(Number(match[1]));
          if(!blind&&/(?:答案|结论|最少|minimum|answer)/i.test(match[0])&&!/(?:假设|假定|有人认为|如果)[^，,。]{0,12}$/.test(before)){
            conclusions.push({value:Number(match[1]),explicit:/(?:最终|最后|更正|修正|改答|final)/i.test(before+prefix),ambiguous:/^\s*(?:颗|个|粒)?\s*(?:或(?:者)?|\/)\s*\d/.test(after)});
          }
        }
        const correction=clause.match(/^\s*(?:是|而是)\s*(\d+)\s*(?:颗|个|粒)?/);
        if(correction&&!blind)values.push(Number(correction[1]));
      }
      // Check only a positively proposed, paired construction, not counterexamples.
      if(/(?:取|摸出|抽出|选择|方案)/.test(sentence)&&!/(?:不能|不够|不足|反例|错误|假设|如果|若|无法|不保证|不成立|任意|随机)/.test(sentence)){
        const round=sentence.match(/(\d+)\s*(?:颗|个|粒)?\s*圆形|圆形\s*(?:取|糖果|糖|的)?\s*(\d+)\s*(?:颗|个|粒)?/);
        const star=sentence.match(/(\d+)\s*(?:颗|个|粒)?\s*(?:五角星形?|星形)|(?:五角星形?|星形)\s*(?:取|糖果|糖|的)?\s*(\d+)\s*(?:颗|个|粒)?/);
        if(round&&star){
          const r=Number(round[1]||round[2]),s=Number(star[1]||star[2]);
          const feasible=r>=0&&s>=0&&r<=counts[0].reduce((a,b)=>a+b,0)&&s<=counts[1].reduce((a,b)=>a+b,0);
          schemes.push({round:r,star:s,total:r+s,guarantees:feasible&&!failures.some(([a,b])=>r<=a&&s<=b)});
        }
      }
    }
    const bare=clean.trim().match(/^(\d+(?:\.\d+)?)\s*(?:颗|个|粒)?[。.!]?$/);
    if(bare)values.push(Number(bare[1]));
    const answers=[...new Set(values)];
    let status='review',summary='未提取到唯一总数，暂记为结论不确定。';
    if(answers.length===1){status=answers[0]===expected?'pass':'fail';summary=status==='pass'?'结论'+expected+'与本题计算结果一致。':'提取到总数'+answers[0]+'，本题标准答案为'+expected+'。'}
    else if(answers.length>1)summary='出现多个总数（'+answers.join('、')+'），暂不计为明确通过或失败。';
    const selected=conclusions.filter(x=>x.explicit).at(-1)||conclusions.at(-1),finalAnswer=selected&&!selected.ambiguous?selected.value:answers.length===1?answers[0]:null;
    if(selected){
      if(selected.ambiguous){status='review';summary='最终结论仍给出了多个候选答案，暂记为不确定。';}
      else{status=finalAnswer===expected?'pass':'fail';summary=status==='pass'?'最终结论为'+expected+'，符合本题标准；正文出现其他数字不影响通过。':'最终结论为'+finalAnswer+'，本题标准答案为'+expected+'。';}
    }
    const invalid=schemes.filter(s=>s.total===expected&&!s.guarantees);
    const valid=schemes.filter(s=>s.total===expected&&s.guarantees);
    if(status==='pass'&&invalid.length){status='fail';summary='总数虽为'+expected+'，但明确提出的取法不能保证目标配对。';}
    const contradictory=new RegExp(expected+'\\s*(?:颗|个|粒)?\\s*(?:不够|不足|无法保证|不能保证)');
    if(status==='pass'&&applicable.some(clause=>contradictory.test(clause))){status='review';summary='回答包含相互矛盾的保证结论，暂记为不确定。'}
    const strategies=spec?.strategies||[{round:9,star:12}];
    return {task:'candy',status,label:labels[status],summary,answers,finalAnswer,expected,schemes,ignoredConditionalAnswers:[...new Set(ignored)],referenceMatch:new RegExp('(^|[^0-9])'+expected+'([^0-9]|$)').test(clean),
      checks:[{label:'最终最少总数'+expected,state:finalAnswer===expected?'yes':status==='fail'?'no':'unknown'},{label:'可识别取法能保证配对',state:invalid.length?'no':valid.length?'yes':'unknown'},{label:'完整最小性证明',state:'unknown'}],
      standard:spec?.variant==='varied'?'对所有圆形与五角星数量组合检查最坏情况，得到'+expected+'颗。可用方案：'+strategies.map(s=>s.round+'颗圆形＋'+s.star+'颗五角星形').join('；'):standard,
      note:'结论由文本规则识别；识别到的取法通过组合枚举校验，不声称已经验证完整数学证明。'};
  }

  function extractArtifact(text) {
    const raw = String(text || '').trim();
    const blocks = [...raw.matchAll(/```[^\n`]*\n([\s\S]*?)```/g)].map(m => m[1].trim());
    const code = blocks.find(b => /<svg(?:\s|>)/i.test(b)) || raw;
    const begin = code.search(/<!doctype\s+html|<html(?:\s|>)|<svg(?:\s|>)/i);
    if (begin < 0) return '';
    let artifact = code.slice(begin);
    const htmlEnd = artifact.toLowerCase().lastIndexOf('</html>');
    if (htmlEnd >= 0) return artifact.slice(0, htmlEnd + 7);
    if (/^<svg[\s>]/i.test(artifact)) { const end = artifact.toLowerCase().lastIndexOf('</svg>'); if (end >= 0) artifact = artifact.slice(0, end + 6); }
    return artifact;
  }
  function pelican(text) {
    const artifact = extractArtifact(text);
    const html = /<!doctype\s+html|<html(?:\s|>)/i.test(artifact) && /<\/html>/i.test(artifact);
    const svg = /<svg(?:\s|>)/i.test(artifact) && /<\/svg>/i.test(artifact);
    const motion = /<animate(?:Transform|Motion)?[\s/>]|@(?:-webkit-)?keyframes|requestAnimationFrame\s*\(|setInterval\s*\(|\.animate\s*\(/i.test(artifact);
    const external = /(?:src|href)\s*=\s*["'](?:https?:)?\/\/|(?:fetch|import)\s*\(|url\s*\(\s*["']?(?:https?:)?\/\//i.test(artifact);
    const status = html && svg && motion ? 'artifact' : 'review';
    return { task: 'pelican', status, label: labels[status], summary: status === 'artifact' ? '已提取HTML、SVG与动画代码，实际效果由自动视觉评审判断。' : '作品结构不完整或没有动画线索，渲染结果另行记录。', checks: [
      { label: '完整HTML文档', state: html ? 'yes' : 'no' },
      { label: '包含SVG画面', state: svg ? 'yes' : 'no' },
      { label: '包含动画代码', state: motion ? 'hint' : 'unknown' },
      { label: '外部资源引用', state: external ? 'hint' : 'none' }
    ], artifact, note: '只检查代码结构，不自动判断画质、鸟类外观或运动合理性。预览使用隔离沙箱，并限制外部资源加载。' };
  }
  function judge(task, text,spec) { if (task !== 'candy' && task !== 'pelican') throw new Error('未知题目'); return task === 'candy' ? candy(text,spec) : pelican(text); }
  function extractResponse(payload) {
    if (typeof payload.output_text === 'string') return payload.output_text;
    if (Array.isArray(payload.output)) {
      return payload.output.filter(x => x.type === 'message').flatMap(x => x.content || []).filter(x => x.type === 'output_text' || x.type === 'text' || x.type === 'refusal').map(x => x.text || x.refusal || '').join('\n');
    }
    const message = payload.choices?.[0]?.message;
    if (typeof message?.content === 'string') return message.content;
    if (Array.isArray(message?.content)) return message.content.filter(x => x.type === 'text').map(x => x.text || '').join('\n');
    return message?.refusal || '';
  }
  return { VERSION, prompts, standard, labels, judge, extractArtifact, extractResponse };
});
