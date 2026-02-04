import dotenv from 'dotenv';

// load environment variables
dotenv.config();

// wx app id
const wxAppId = process.env.WX_APP_ID;
if (!wxAppId) {
  throw new Error('WX_APP_ID is not set');
}

const wxAppSecret = process.env.APP_SECRET;
if (!wxAppSecret) {
  throw new Error('APP_SECRET is not set');
}

export async function getWxOpenId(code: string): Promise<string | null> {
  // https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/login/auth.code2Session.html
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.append('appid', wxAppId as string);
  url.searchParams.append('secret', wxAppSecret as string);
  url.searchParams.append('js_code', code);
  url.searchParams.append('grant_type', 'authorization_code');

  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.errcode) {
    console.error(data.errmsg);
    return null;
  }
  return data.openid;
}
