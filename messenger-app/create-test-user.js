async function createTestUser() {
  try {
    console.log('Creating test user...');
    
    const response = await fetch('http://localhost:8080/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'testuser2',
        email: 'test2@test.com',
        password: 'test123',
        confirmPassword: 'test123'
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Test user created:', data.user.username);
      console.log('User ID:', data.user.id);
      return data.user;
    } else {
      const error = await response.json();
      console.log('❌ Failed to create user:', response.status, error);
      return null;
    }
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

createTestUser();
