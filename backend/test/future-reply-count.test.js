const test = require('node:test');
const assert = require('node:assert/strict');
const {validationResult} = require('express-validator');
const validators = require('../src/validators/ai.validators').generateRepliesValidators;
const ai = require('../src/services/ai.service');
const provider = require('../src/services/openrouter.service');
const knowledge = require('../src/services/knowledge.service');
const controller = require('../src/controllers/ai.controller');
const fixture = JSON.stringify({replies:[1,2,3].map(n=>({text:`Opção ${n}`,confident:true}))});

test('quantidade 1/2/3 e padrão preservam formato, contexto e revisão', async () => {
  const oldContext=knowledge.buildContext, oldChat=provider.chatCompletion;
  const prompts=[], users=[];
  knowledge.buildContext=async id=>{users.push(id);return {profile:{},knowledgeBlock:'',hasKnowledge:false};};
  provider.chatCompletion=async messages=>{prompts.push(messages);return fixture;};
  try {
    for (const count of [1,2,3,undefined]) {
      const result=await ai.generateReplies('synthetic-user',{text:'Meu pedido?',replyCount:count});
      assert.equal(result.replies.length,count??3);
      assert.equal(result.hasKnowledge,false);
      assert.ok(result.replies.every(r=>r.confident===false&&/vazia/.test(r.reviewReason)));
      assert.match(prompts.at(-1)[0].content,new RegExp(`Sempre ${count??3} objeto`));
      assert.match(prompts.at(-1)[1].content,new RegExp(`Gere ${count??3} resposta`));
    }
    assert.deepEqual(users,Array(4).fill('synthetic-user'));
  } finally {knowledge.buildContext=oldContext;provider.chatCompletion=oldChat;}
});

test('quantidades inválidas são rejeitadas antes de qualquer integração', async () => {
  const old=knowledge.buildContext;let calls=0;
  knowledge.buildContext=async()=>{calls++;throw Error('Não deveria consultar');};
  try {
    for (const count of [0,4,-1,1.5,'2',true,null,{},[]]) {
      await assert.rejects(ai.generateReplies('fixture',{text:'Teste',replyCount:count}),e=>e.statusCode===400);
    }
    assert.equal(calls,0);
  } finally {knowledge.buildContext=old;}
});

test('validação pública exige número inteiro JSON e mantém chamadas antigas', async () => {
  for (const count of [undefined,1,2,3,0,4,1.5,'2',true,null]) {
    const req={body:{text:'Olá',...(count===undefined?{}:{replyCount:count})}};
    for(const validate of validators) await validate.run(req);
    assert.equal(validationResult(req).isEmpty(),count===undefined||[1,2,3].includes(count));
  }
});

test('controller encaminha quantidade e identidade autenticada', async () => {
  const old=ai.generateReplies;let received;
  ai.generateReplies=async(...args)=>{received=args;return {replies:[{text:'Teste'}],hasKnowledge:true};};
  try {
    const result=await new Promise((resolve,reject)=>controller.generateReplies({user:{id:'fixture-user'},body:{text:'Oi',replyCount:1}},{status(code){assert.equal(code,200);return this;},json:resolve},reject));
    assert.equal(received[0],'fixture-user');assert.equal(received[1].replyCount,1);assert.equal(result.replies.length,1);
  } finally {ai.generateReplies=old;}
});

test('resposta menor não é duplicada e vazia mantém erro de indisponibilidade', async () => {
  const oldContext=knowledge.buildContext,oldChat=provider.chatCompletion;
  knowledge.buildContext=async()=>({profile:{},knowledgeBlock:'Horário: 9h.',hasKnowledge:true});
  try {
    provider.chatCompletion=async()=>JSON.stringify({replies:[{text:'Às 9h.',confident:true}]});
    const r=await ai.generateReplies('fixture',{text:'Horário?',replyCount:2});
    assert.equal(r.replies.length,1);assert.equal(r.replies[0].confident,true);
    provider.chatCompletion=async()=>'';
    await assert.rejects(ai.generateReplies('fixture',{text:'Horário?',replyCount:1}),e=>e.statusCode===503);
  } finally {knowledge.buildContext=oldContext;provider.chatCompletion=oldChat;}
});
