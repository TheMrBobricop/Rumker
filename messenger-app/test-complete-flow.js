async function testCompleteFlow() {
  try {
    console.log('🚀 Testing complete auth and chat flow...\n');
    
    // 1. Login
    console.log('1. Testing login...');
    const loginResponse = await fetch('http://localhost:8080/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@test.com',
        password: 'test123'
      })
    });
    
    if (!loginResponse.ok) {
      console.log('❌ Login failed:', loginResponse.status);
      return;
    }
    
    const loginData = await loginResponse.json();
    console.log('✅ Login successful!');
    
    // 2. Test /api/auth/me
    console.log('\n2. Testing /api/auth/me...');
    const meResponse = await fetch('http://localhost:8080/api/auth/me', {
      headers: { 'Authorization': `Bearer ${loginData.accessToken}` }
    });
    
    if (!meResponse.ok) {
      console.log('❌ /api/auth/me failed:', meResponse.status);
    } else {
      const meData = await meResponse.json();
      console.log('✅ /api/auth/me works! User:', meData.username);
    }
    
    // 3. Test refresh token
    console.log('\n3. Testing refresh token...');
    const refreshResponse = await fetch('http://localhost:8080/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: loginData.refreshToken })
    });
    
    if (!refreshResponse.ok) {
      console.log('❌ Refresh failed:', refreshResponse.status);
    } else {
      console.log('✅ Refresh token works!');
    }
    
    // 4. Test chats
    console.log('\n4. Testing chats...');
    const chatsResponse = await fetch('http://localhost:8080/api/chats', {
      headers: { 'Authorization': `Bearer ${loginData.accessToken}` }
    });
    
    if (!chatsResponse.ok) {
      console.log('❌ Chats failed:', chatsResponse.status);
    } else {
      const chats = await chatsResponse.json();
      console.log('✅ Chats work! Found:', chats.length, 'chats');
      
      if (chats.length > 0) {
        const chatId = chats[0].id;
        
        // 5. Test chat members endpoint
        console.log('\n5. Testing chat members endpoint...');
        const membersResponse = await fetch(`http://localhost:8080/api/chats/${chatId}/members`, {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${loginData.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userIds: ['152a946b-ab21-4268-88ca-9c4c918edbf2'] // testuser2
          })
        });
        
        if (!membersResponse.ok) {
          console.log('❌ Add members failed:', membersResponse.status);
          const error = await membersResponse.json();
          console.log('Error:', error);
        } else {
          console.log('✅ Add members works!');
        }
        
        // 6. Test get messages
        console.log('\n6. Testing get messages...');
        const messagesResponse = await fetch(`http://localhost:8080/api/chats/${chatId}/messages?limit=50`, {
          headers: { 'Authorization': `Bearer ${loginData.accessToken}` }
        });
        
        if (!messagesResponse.ok) {
          console.log('❌ Get messages failed:', messagesResponse.status);
        } else {
          const messages = await messagesResponse.json();
          console.log('✅ Get messages works! Found:', messages.length, 'messages');
        }
      }
    }
    
    console.log('\n🎉 All tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testCompleteFlow();
