import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const derive=promisify(scrypt);
const cost={N:16384,r:8,p:5,maxmem:32*1024*1024};
const fingerprint=token=>createHash('sha256').update(token).digest('hex');
const tokenFrom=request=>request.headers.cookie?.match(/(?:^|;\s*)hv_auth=([a-f0-9]{64})(?:;|$)/)?.[1];
const publicUser=row=>row?{id:row.id,email:row.email,firstName:row.first_name,lastName:row.last_name,createdAt:row.created_at}:null;
function failure(status,message,code){return Object.assign(new Error(message),{status,code});}
function emailAddress(value){
  if(typeof value!=='string'||value.trim().length>120||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))throw failure(400,'Enter a valid email address.');
  return value.trim().toLowerCase();
}
async function passwordHash(password){
  const salt=randomBytes(16).toString('hex');
  const key=await derive(password,salt,64,cost);
  return salt+':'+key.toString('hex');
}
async function passwordMatches(password,stored){
  const [salt,key]=stored.split(':');
  const actual=await derive(password,salt,64,cost);
  return timingSafeEqual(actual,Buffer.from(key,'hex'));
}

export function createAccounts(db,{body,json,secureCookies=false}){
  db.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    first_name TEXT NOT NULL,last_name TEXT NOT NULL,password_hash TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(user_id);`);
  const attempts=new Map();
  const lifetime=7*24*60*60*1000;
  function throttle(request){
    const now=Date.now(),key=request.socket.remoteAddress;
    for(const [address,entry]of attempts)if(entry.until<=now)attempts.delete(address);
    const entry=attempts.get(key)||{count:0,until:now+15*60*1000};
    if(entry.count>=30)throw failure(429,'Too many sign-in attempts. Please try again in 15 minutes.');
    entry.count++;attempts.set(key,entry);
  }
  function cookie(request,token,maxAge){
    return `hv_auth=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secureCookies||request.socket.encrypted?'; Secure':''}`;
  }
  function getUser(request){
    const token=tokenFrom(request);if(!token)return null;
    const row=db.prepare('SELECT users.* FROM users JOIN auth_sessions ON auth_sessions.user_id=users.id WHERE token_hash=? AND expires_at>?').get(fingerprint(token),Date.now());
    return publicUser(row);
  }
  function requireUser(request){
    const user=getUser(request);if(!user)throw failure(401,'Please sign in to continue.','AUTH_REQUIRED');return user;
  }
  function signIn(request,response,userId){
    const previous=tokenFrom(request);if(previous)db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(fingerprint(previous));
    db.prepare('DELETE FROM auth_sessions WHERE expires_at<=?').run(Date.now());
    const token=randomBytes(32).toString('hex');
    db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(fingerprint(token),userId,Date.now()+lifetime);
    response.setHeader('Set-Cookie',cookie(request,token,Math.floor(lifetime/1000)));
  }
  async function handle(request,response,path){
    if(path==='/api/auth/me'&&request.method==='GET'){json(response,200,{user:getUser(request)});return true;}
    if(path==='/api/auth/logout'&&request.method==='POST'){
      const token=tokenFrom(request);if(token)db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(fingerprint(token));
      response.setHeader('Set-Cookie',cookie(request,'',0));json(response,200,{user:null});return true;
    }
    if(!['/api/auth/register','/api/auth/login'].includes(path))return false;
    if(request.method!=='POST')throw failure(405,'Use the account form to continue.');
    throttle(request);
    const input=await body(request);
    const email=emailAddress(input?.email);
    if(typeof input?.password!=='string'||!input.password.length||input.password.length>128)throw failure(400,'Enter a password of at most 128 characters.');
    if(path==='/api/auth/register'){
      if(input.password.length<12)throw failure(400,'Choose a password of at least 12 characters.');
      for(const field of ['firstName','lastName'])if(typeof input[field]!=='string'||!input[field].trim()||input[field].trim().length>60)throw failure(400,'Enter your first and last name (up to 60 characters each).');
      const hash=await passwordHash(input.password),id=randomUUID(),created=new Date().toISOString();
      try{db.prepare('INSERT INTO users(id,email,first_name,last_name,password_hash,created_at) VALUES(?,?,?,?,?,?)').run(id,email,input.firstName.trim(),input.lastName.trim(),hash,created);}
      catch(error){if(db.prepare('SELECT id FROM users WHERE email=?').get(email))throw failure(409,'An account with this email already exists. Please sign in.');throw error;}
      signIn(request,response,id);json(response,201,{user:publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(id))});return true;
    }
    const row=db.prepare('SELECT * FROM users WHERE email=?').get(email);
    const matches=await passwordMatches(input.password,row?.password_hash||('0'.repeat(32)+':'+'0'.repeat(128)));
    if(!row||!matches)throw failure(401,'Email or password is incorrect.','INVALID_CREDENTIALS');
    signIn(request,response,row.id);json(response,200,{user:publicUser(row)});return true;
  }
  return {getUser,requireUser,handle};
}
