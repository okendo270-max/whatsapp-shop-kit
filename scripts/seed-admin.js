// scripts/seed-admin.js
// Usage:
// SUPABASE_SERVICE_KEY="<service_role_key_here>" node scripts/seed-admin.js admin@example.com "SuperSecret123!" superadmin
// OR explicitly:
// SUPABASE_URL="https://lwcnuecbekspirfytdgu.supabase.co" SUPABASE_SERVICE_KEY="<service_role_key_here>" node scripts/seed-admin.js admin@example.com "SuperSecret123!" superadmin

import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://lwcnuecbekspirfytdgu.supabase.co';
const [,, email, password, role = 'superadmin'] = process.argv;

if (!email || !password) {
  console.error('Usage: node scripts/seed-admin.js <email> <password> [role]');
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_KEY environment variable. Do not commit this key.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

async function columnExists(col) {
  // Try selecting that column; if the column doesn't exist the API will return an error
  const { error } = await supabase.from('admins').select(col).limit(1);
  if (error) {
    // Column missing or other error
    return false;
  }
  return true;
}

async function main() {
  try {
    console.log(`Using Supabase URL: ${SUPABASE_URL}`);
    console.log(`Creating auth user for ${email}...`);

    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role }
    });

    if (createError) {
      console.warn('Create user error:', createError.message || createError);

      // If auth creation failed (maybe user already exists), try to find an admins row by email.
      const { data: existingByEmail, error: selErr } = await supabase
        .from('admins')
        .select('*')
        .eq('email', email)
        .limit(1)
        .maybeSingle();

      if (selErr) {
        console.error('Error querying admins table:', selErr);
        process.exit(1);
      }

      if (existingByEmail) {
        console.log('Found existing admins row with that email. Updating role if needed.');
        const { error: updErr } = await supabase
          .from('admins')
          .update({ role })
          .eq('email', email);
        if (updErr) {
          console.error('Failed to update existing admin role:', updErr);
          process.exit(1);
        }
        console.log('Admin row updated. No auth user created because createUser failed (user may already exist).');
        process.exit(0);
      }

      console.error('Auth create failed and no admins row found. Inspect the createUser error above.');
      process.exit(1);
    }

    const user = createData?.user ?? createData;
    if (!user || !user.id) {
      console.error('Unexpected response from createUser:', createData);
      process.exit(1);
    }
    const authUserId = user.id;
    console.log('Auth user created with id:', authUserId);

    // If an admins row already exists by auth_user_id or email, update instead of inserting
    // Prefer searching by auth_user_id if that column exists.
    if (await columnExists('auth_user_id')) {
      console.log('Detected column: auth_user_id. Inserting/updating with auth_user_id.');
      const { data: existingByAuth, error: selErr } = await supabase
        .from('admins')
        .select('*')
        .eq('auth_user_id', authUserId)
        .limit(1)
        .maybeSingle();

      if (selErr) throw selErr;

      if (existingByAuth) {
        const { error: updErr } = await supabase
          .from('admins')
          .update({ email, role })
          .eq('auth_user_id', authUserId);
        if (updErr) throw updErr;
        console.log('Updated existing admin row (by auth_user_id).');
        process.exit(0);
      }

      // Insert with auth_user_id
      const created_at = new Date().toISOString();
      const { error: insErr } = await supabase
        .from('admins')
        .insert([{ auth_user_id: authUserId, email, role, created_at }]);
      if (insErr) throw insErr;
      console.log('Inserted admin row with auth_user_id. Done.');
      process.exit(0);
    }

    // If auth_user_id doesn't exist, try to find by email and update
    const { data: existingByEmail, error: selEmailErr } = await supabase
      .from('admins')
      .select('*')
      .eq('email', email)
      .limit(1)
      .maybeSingle();

    if (selEmailErr) throw selEmailErr;

    if (existingByEmail) {
      const { error: updErr } = await supabase
        .from('admins')
        .update({ role })
        .eq('email', email);
      if (updErr) throw updErr;
      console.log('Found admin row by email and updated role. Note: admin row not linked to auth UUID column.');
      process.exit(0);
    }

    // Finally, insert a row without specifying id to let serial PK be assigned.
    // This will create an admin row with email+role but will not link the auth UUID.
    const created_at = new Date().toISOString();
    const { error: insErr2 } = await supabase
      .from('admins')
      .insert([{ email, role, created_at }]);

    if (insErr2) {
      console.error('Failed to insert admin row (no auth_user_id column and no existing email):', insErr2);
      process.exit(1);
    }

    console.log('Inserted admin row with serial id assigned by DB (not linked to auth UUID).');
    console.log('If you want the admin row linked to the auth user, add an auth_user_id column (text/uuid) to admins and re-run.');
    process.exit(0);
  } catch (err) {
    if (err?.cause?.code === 'ENOTFOUND' || err?.code === 'ENOTFOUND') {
      console.error(`DNS error reaching Supabase host. Check SUPABASE_URL: "${SUPABASE_URL}"`);
      process.exit(1);
    }
    console.error('Unexpected error:', err);
    process.exit(1);
  }
}

await main();
