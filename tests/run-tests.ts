import assert from 'assert';
import crypto from 'crypto';
import { normalizePath, getParentPath, resolvePath } from '../src/filesystem/paths';
import { validateTelegramMiniAppInitData } from '../src/auth/miniAppAuth';
import { TelegramOidcService } from '../src/auth/telegramOidc';
import { JsonDatabase, db } from '../src/database/jsonDatabase';
import { DirectoryService } from '../src/services/directoryService';
import { MediaService } from '../src/services/mediaService';
import { AccessService } from '../src/services/accessService';
import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    })
    .catch((err) => {
      console.error(`  ❌ FAIL: ${name}`, err);
      failed++;
    });
}

async function runAllTests() {
  console.log('\n=============================================');
  console.log('🧪 TELEGRAM MEDIA MANAGER SUITE OF TESTS');
  console.log('=============================================\n');

  // 1. Path & Directory Traversal Tests
  console.log('--- 1. Directory Path & Traversal Protection ---');
  await test('normalizePath handles root and empty correctly', () => {
    assert.strictEqual(normalizePath(''), '/');
    assert.strictEqual(normalizePath('/'), '/');
    assert.strictEqual(normalizePath('///'), '/');
  });

  await test('normalizePath prevents directory traversal above root', () => {
    assert.strictEqual(normalizePath('../../../etc/passwd'), '/etc/passwd');
    assert.strictEqual(normalizePath('/Cox Tour/../../..'), '/');
    assert.strictEqual(normalizePath('/Cox Tour/Photos/..'), '/Cox Tour');
  });

  await test('normalizePath supports Unicode, Bengali, Chinese and spaces', () => {
    assert.strictEqual(normalizePath('/Cox Tour/বাংলাদেশ/Photos'), '/Cox Tour/বাংলাদেশ/Photos');
    assert.strictEqual(normalizePath('/旅行 2026/Tokyo 🌸'), '/旅行 2026/Tokyo 🌸');
  });

  await test('getParentPath works correctly', () => {
    assert.strictEqual(getParentPath('/'), null);
    assert.strictEqual(getParentPath('/Cox Tour'), '/');
    assert.strictEqual(getParentPath('/Cox Tour/Photos'), '/Cox Tour');
  });

  await test('resolvePath combines relative and absolute paths', () => {
    assert.strictEqual(resolvePath('/Cox Tour', 'Photos'), '/Cox Tour/Photos');
    assert.strictEqual(resolvePath('/Cox Tour/Photos', '..'), '/Cox Tour');
    assert.strictEqual(resolvePath('/Cox Tour', '/Projects'), '/Projects');
  });

  // 2. Mini App Cryptographic Authentication Tests
  console.log('\n--- 2. Telegram Mini App Authentication ---');
  const mockBotToken = '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ';

  await test('validates authentic Telegram Mini App initData', () => {
    const userPayload = JSON.stringify({ id: 999888, first_name: 'Jenny', username: 'jennystar' });
    const authDate = Math.floor(Date.now() / 1000);

    const params = new URLSearchParams();
    params.set('auth_date', authDate.toString());
    params.set('query_id', 'AAHdF6IQAAAAAN0XohDhrOrc');
    params.set('user', userPayload);

    // Sort keys and compute valid HMAC
    const keys = Array.from(params.keys()).sort();
    const dataCheckArr = keys.map((k) => `${k}=${params.get(k)}`);
    const dataCheckString = dataCheckArr.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(mockBotToken).digest();
    const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    params.set('hash', hash);
    const validInitData = params.toString();

    const result = validateTelegramMiniAppInitData(validInitData, mockBotToken);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.user?.id, 999888);
    assert.strictEqual(result.user?.username, 'jennystar');
  });

  await test('rejects tampered hash in initData', () => {
    const invalidInitData = 'auth_date=1700000000&user=%7B%22id%22%3A123%7D&hash=deadbeef00112233';
    const result = validateTelegramMiniAppInitData(invalidInitData, mockBotToken);
    assert.strictEqual(result.valid, false);
  });

  await test('rejects expired auth_date (replay attack protection)', () => {
    const userPayload = JSON.stringify({ id: 123, first_name: 'OldUser' });
    const expiredAuthDate = Math.floor(Date.now() / 1000) - 100000; // > 24 hours ago

    const params = new URLSearchParams();
    params.set('auth_date', expiredAuthDate.toString());
    params.set('user', userPayload);

    const keys = Array.from(params.keys()).sort();
    const dataCheckString = keys.map((k) => `${k}=${params.get(k)}`).join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(mockBotToken).digest();
    const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    params.set('hash', hash);

    const result = validateTelegramMiniAppInitData(params.toString(), mockBotToken);
    assert.strictEqual(result.valid, false);
    assert.match(result.error || '', /expired/i);
  });

  // 3. Telegram OIDC PKCE Generation Tests
  console.log('\n--- 3. Telegram OpenID Connect (OIDC) ---');
  await test('generates high-entropy PKCE S256 verifier and challenge', () => {
    const oidcService = new TelegramOidcService();
    const { codeVerifier, codeChallenge } = oidcService.generatePkce();
    assert.ok(codeVerifier.length >= 43);
    assert.ok(codeChallenge.length >= 43);

    // Verify SHA256 base64url derivation
    const computedChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    assert.strictEqual(codeChallenge, computedChallenge);
  });

  // 4. Database & Atomic Operations Tests
  console.log('\n--- 4. Atomic JSON Database & Concurrency ---');
  const testDbFile = path.resolve(process.cwd(), 'data', 'test-database.json');
  if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile);
  const testDb = new JsonDatabase(testDbFile);

  await test('initializes and saves records with atomic writes', async () => {
    await testDb.init();
    await testDb.saveDirectory({
      id: 'test-dir-1',
      name: 'TestDir',
      path: '/TestDir',
      parent_path: '/',
      created_at: Date.now(),
      updated_at: Date.now(),
      created_by: 123,
    });

    const retrieved = await testDb.getDirectory('/TestDir');
    assert.ok(retrieved);
    assert.strictEqual(retrieved?.name, 'TestDir');
  });

  await test('handles concurrent writes sequentially without corruption', async () => {
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 20; i++) {
      promises.push(
        testDb.saveDirectory({
          id: `concurrent-dir-${i}`,
          name: `Concurrent ${i}`,
          path: `/Concurrent_${i}`,
          parent_path: '/',
          created_at: Date.now(),
          updated_at: Date.now(),
          created_by: 123,
        })
      );
    }
    await Promise.all(promises);
    const all = await testDb.getAllDirectories();
    const concurrents = all.filter((d) => d.path.startsWith('/Concurrent_'));
    assert.strictEqual(concurrents.length, 20);
  });

  // 5. Authorization States & Role Checks
  console.log('\n--- 5. Authorization States (Unknown, Pending, Approved, Banned) ---');
  const access = new AccessService();
  const testUserId = 700000 + Math.floor(Math.random() * 100000);

  await test('new user starts as unknown', async () => {
    const user = await access.getOrCreateUser({ id: testUserId, first_name: 'Alex' });
    assert.strictEqual(user.auth_state, 'unknown');
  });

  await test('request access transitions to pending', async () => {
    const reqRes = await access.requestAccess(testUserId);
    assert.strictEqual(reqRes.state, 'pending');
  });

  await test('admin can approve user', async () => {
    const user = await access.approveUser(testUserId);
    assert.strictEqual(user.auth_state, 'approved');
  });

  await test('admin can ban user and ban blocks requesting again', async () => {
    await access.banUser(testUserId);
    const banReq = await access.requestAccess(testUserId);
    assert.strictEqual(banReq.success, false);
    assert.strictEqual(banReq.state, 'banned');

    // Clean up test user
    await db.deleteUser(testUserId);
  });

  // 6. Media Service & Duplicate Names
  console.log('\n--- 6. Media Management & Duplicate Filenames ---');
  const media = new MediaService();
  const uniquePrefix = `test_pic_${Date.now()}`;

  await test('prevents filename collisions by generating predictable suffixes', async () => {
    const name1 = await media.getUniqueFilename('/Photos', `${uniquePrefix}.jpg`);
    assert.strictEqual(name1, `${uniquePrefix}.jpg`);

    const created = await media.createMedia({
      name: `${uniquePrefix}.jpg`,
      media_type: 'image',
      mime_type: 'image/jpeg',
      size: 5000,
      directory: '/Photos',
      telegram: { file_id: 'tg_1', source_chat_id: -1001, source_message_id: 1 },
      uploaded_by: 123,
    });

    const name2 = await media.getUniqueFilename('/Photos', `${uniquePrefix}.jpg`);
    assert.strictEqual(name2, `${uniquePrefix} (2).jpg`);

    // Clean up created media and directory
    await db.deleteMedia(created.id);
    await db.deleteDirectory('/Photos');
  });

  // Cleanup test db
  if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile);
  const tmp = `${testDbFile}.tmp`;
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);

  console.log('\n=============================================');
  console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests();
