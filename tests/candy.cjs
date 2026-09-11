const assert=require('node:assert/strict'),C=require('../core.cjs'),B=require('../benchmark.cjs');
const samples=[
 ['最少21颗。至少9颗圆形，至少12颗五角星形。','pass'],
 ['最少需要9颗圆形和12颗五角星形，共21颗。','pass'],
 ['The minimum is 21 candies.','pass'],
 ['不能选择形状时至少29颗，但能选形状时最少21颗。','pass'],
 ['答案不是29，而是21。','pass'],
 ['最少21颗，取圆形10颗、五角星形11颗。','fail'],
 ['最少29颗。','fail'],['最少需要二十一颗。','pass'],
 ['最少需要9＋12＝21颗。','pass'],
 ['最少21颗，但21颗不能保证。','review'],
 ['最少21颗。必定至少有一个苹果味或桃子味。圆形苹果味和西瓜味共有7+8=15个。','pass'],
 ['最少21颗。取9颗圆形和12颗五角星形共21颗。','pass'],
 ['最少取出\\(21\\)个，圆形苹果味和西瓜味共有\\(7+8=15\\)个。','pass'],
 ['最少21颗。若总数不超过20颗，可能没有桃子味。','pass'],
 ['最少21颗。由总数为20可知圆形只有9颗。','pass'],
 ['最少21颗。苹果味与西瓜味合计恰好有圆形7+8=15个。','pass'],
 ['最少21颗。但是答案为29颗。','fail'],
 ['最终结论为21颗。正文中也讨论29颗。','pass'],
 ['有人回答29颗，但本题最终结论是21颗。','pass'],
 ['最少21颗。另一种情形29颗。','pass'],
 ['最终结论是29颗，曾考虑21颗。','fail'],
 ['最终答案21或29颗。','review'],
 ['最少需要21颗。若只能完全随机取糖、不能按形状挑选，则答案29颗。','pass'],
 ['正文出现21这个数字。最终答案29颗。','fail'],
 ['最终结论是21颗。常见误答的答案是29颗。','pass'],
 ['最终答案21颗。更正：答案29颗。','fail'],
 ['最终答案29颗。最终改答：答案21颗。','pass'],
 ['最终结论为21颗。若只能随机取糖，21颗不能保证。','pass']
];
for(const [s,status]of samples)assert.equal(C.judge('candy',s).status,status,s);
for(let i=0;i<30;i++){const spec=B.taskSpec('candy','varied','test'+i);assert.equal(C.judge('candy','最少需要'+spec.expected+'颗。',spec).status,'pass')}
console.log(JSON.stringify({passed:true,parserCases:samples.length,variedCases:30}));
