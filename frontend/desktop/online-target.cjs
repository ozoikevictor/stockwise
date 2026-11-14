const {URL}=require('node:url');
function onlineTarget(value='http://127.0.0.1:3003') {
  const url=new URL(value);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Enter the server address only, for example https://your-shop.onrender.com');
  if(url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('The online server must use HTTPS. HTTP is allowed only for local testing.');
  return url.origin;
}
module.exports={onlineTarget};
