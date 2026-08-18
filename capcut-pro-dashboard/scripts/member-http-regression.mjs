import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3100';
const connectionString = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET || 'member-http-regression-secret';
if (!connectionString) throw new Error('DATABASE_URL missing');

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
const stamp = Date.now();
const memberEmail = `http-member-${stamp}@dorizz.local`;
const noTermsEmail = `http-noterms-${stamp}@dorizz.local`;
const password = 'TestMember123!';
const adminPassword = 'AdminTest123!';
const adminIds = {
  denied: '91111111-1111-4111-8111-111111111111',
  allowed: '92222222-2222-4222-8222-222222222222',
  developer: '93333333-3333-4333-8333-333333333333',
  superadmin: '94444444-4444-4444-8444-444444444444',
};
const adminEmails = {
  denied: `http-denied-${stamp}@dorizz.local`,
  allowed: `http-allowed-${stamp}@dorizz.local`,
  developer: `http-developer-${stamp}@dorizz.local`,
  superadmin: `http-superadmin-${stamp}@dorizz.local`,
};

function assert(condition, message) { if (!condition) throw new Error(message); }
function cookieFrom(res, name) {
  const raw = res.headers.get('set-cookie') || '';
  const match = raw.match(new RegExp(`${name}=([^;]*)`));
  return match ? `${name}=${match[1]}` : '';
}
async function request(path, options = {}) {
  const res = await fetch(base + path, options);
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
  return { res, json, text };
}
async function adminLogin(email) {
  const out = await request('/api/auth/login', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({email,password:adminPassword}) });
  assert(out.res.status === 200, `admin login ${email} expected 200 got ${out.res.status}: ${out.text}`);
  const cookie = cookieFrom(out.res, 'admin_token');
  assert(cookie, `admin cookie missing for ${email}`);
  return cookie;
}

let joinedMemberId = null;
try {
  const hash = await bcrypt.hash(adminPassword, 12);
  await prisma.$executeRawUnsafe(`DELETE FROM admin_users WHERE id IN ($1::uuid,$2::uuid,$3::uuid,$4::uuid)`, adminIds.denied, adminIds.allowed, adminIds.developer, adminIds.superadmin);
  await prisma.$executeRawUnsafe(`INSERT INTO admin_users(id,email,name,password,role,status,permissions) VALUES
    ($1::uuid,$2,'HTTP Denied',$3,'admin','active',$4::jsonb),
    ($5::uuid,$6,'HTTP Allowed',$3,'admin','active',$7::jsonb),
    ($8::uuid,$9,'HTTP Developer',$3,'developer','active',$4::jsonb),
    ($10::uuid,$11,'HTTP Superadmin',$3,'superadmin','active',$4::jsonb)`,
    adminIds.denied,adminEmails.denied,hash,JSON.stringify({page_members:false}),
    adminIds.allowed,adminEmails.allowed,JSON.stringify({page_members:true}),
    adminIds.developer,adminEmails.developer,
    adminIds.superadmin,adminEmails.superadmin);

  const noTerms = await request('/api/member/auth/join', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({name:'No Terms',email:noTermsEmail,whatsapp:'081234500001',password,acceptTerms:false}) });
  assert(noTerms.res.status === 400, `join without T&C expected 400 got ${noTerms.res.status}: ${noTerms.text}`);

  const join = await request('/api/member/auth/join', { method:'POST', headers:{'content-type':'application/json','user-agent':'member-http-regression'}, body:JSON.stringify({name:'HTTP Member Test',email:memberEmail,whatsapp:'081234500002',password,acceptTerms:true}) });
  assert(join.res.status === 200, `join expected 200 got ${join.res.status}: ${join.text}`);
  joinedMemberId = join.json?.member?.id;
  assert(joinedMemberId, 'join member id missing');
  const joinCookie = cookieFrom(join.res, 'member_token');
  assert(joinCookie, 'join member cookie missing');
  const terms = await prisma.$queryRawUnsafe(`SELECT terms_version FROM member_terms_acceptances WHERE member_id=$1::uuid`, joinedMemberId);
  assert(terms.length === 1, `T&C acceptance expected 1 got ${terms.length}`);

  const wrong = await request('/api/member/auth/login', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({email:memberEmail,password:'wrong-password'}) });
  assert(wrong.res.status === 401, `wrong password expected 401 got ${wrong.res.status}`);

  const login = await request('/api/member/auth/login', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({email:memberEmail,password}) });
  assert(login.res.status === 200, `login expected 200 got ${login.res.status}: ${login.text}`);
  const memberCookie = cookieFrom(login.res, 'member_token');
  assert(memberCookie, 'login member cookie missing');
  const dashboard = await request('/api/member/portal/dashboard', { headers:{cookie:memberCookie} });
  assert(dashboard.res.status === 200, `authenticated member dashboard expected 200 got ${dashboard.res.status}: ${dashboard.text}`);

  const logout = await request('/api/member/auth/logout', { method:'POST', headers:{cookie:memberCookie} });
  assert(logout.res.status === 200, `logout expected 200 got ${logout.res.status}`);
  const clearHeader = logout.res.headers.get('set-cookie') || '';
  assert(clearHeader.includes('member_token=') && (clearHeader.toLowerCase().includes('max-age=0') || clearHeader.toLowerCase().includes('expires=')), `logout did not clear cookie: ${clearHeader}`);
  const postLogout = await request('/api/member/portal/dashboard');
  assert(postLogout.res.status === 401, `post logout unauthenticated expected 401 got ${postLogout.res.status}`);

  const secret = new TextEncoder().encode(jwtSecret);
  const expiredToken = await new SignJWT({id:joinedMemberId,email:memberEmail,name:'HTTP Member Test',role:'member'}).setProtectedHeader({alg:'HS256'}).setIssuedAt(Math.floor(Date.now()/1000)-120).setExpirationTime(Math.floor(Date.now()/1000)-60).sign(secret);
  const expired = await request('/api/member/portal/dashboard', { headers:{cookie:`member_token=${expiredToken}`} });
  assert(expired.res.status === 401, `expired session expected 401 got ${expired.res.status}: ${expired.text}`);

  const deniedCookie = await adminLogin(adminEmails.denied);
  const denied = await request('/api/admin/members/overview', {headers:{cookie:deniedCookie}});
  assert(denied.res.status === 403, `admin without page_members expected 403 got ${denied.res.status}: ${denied.text}`);

  const allowedCookie = await adminLogin(adminEmails.allowed);
  const allowed = await request('/api/admin/members/overview', {headers:{cookie:allowedCookie}});
  assert(allowed.res.status === 200, `admin page_members expected 200 got ${allowed.res.status}: ${allowed.text}`);

  const developerCookie = await adminLogin(adminEmails.developer);
  const developer = await request('/api/admin/members/overview', {headers:{cookie:developerCookie}});
  assert(developer.res.status === 200, `developer expected 200 got ${developer.res.status}: ${developer.text}`);

  const superCookie = await adminLogin(adminEmails.superadmin);
  const superadmin = await request('/api/admin/members/overview', {headers:{cookie:superCookie}});
  assert(superadmin.res.status === 200, `superadmin expected 200 got ${superadmin.res.status}: ${superadmin.text}`);

  console.log(JSON.stringify({
    join_with_terms: 'PASS', join_without_terms_400: 'PASS', terms_recorded: 'PASS', login_success: 'PASS', wrong_password_401: 'PASS',
    logout_clears_session: 'PASS', expired_session_401: 'PASS', admin_without_page_members_403: 'PASS', admin_page_members_200: 'PASS', developer_200: 'PASS', superadmin_200: 'PASS'
  }, null, 2));
} finally {
  if (joinedMemberId) {
    await prisma.$executeRawUnsafe(`DELETE FROM member_terms_acceptances WHERE member_id=$1::uuid`, joinedMemberId).catch(()=>{});
    await prisma.$executeRawUnsafe(`DELETE FROM member_notifications WHERE member_id=$1::uuid`, joinedMemberId).catch(()=>{});
    await prisma.$executeRawUnsafe(`DELETE FROM members WHERE id=$1::uuid`, joinedMemberId).catch(()=>{});
  }
  await prisma.$executeRawUnsafe(`DELETE FROM members WHERE email IN ($1,$2)`, memberEmail, noTermsEmail).catch(()=>{});
  await prisma.$executeRawUnsafe(`DELETE FROM admin_users WHERE id IN ($1::uuid,$2::uuid,$3::uuid,$4::uuid)`, adminIds.denied, adminIds.allowed, adminIds.developer, adminIds.superadmin).catch(()=>{});
  await prisma.$disconnect();
}
