async function testChatMembers() {
  try {
    // Сначала логинимся
    console.log('1. Login...');
    const loginResponse = await fetch('http://localhost:8080/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@test.com',
        password: 'test123'
      })
    });
    
    const loginData = await loginResponse.json();
    const token = loginData.accessToken;
    console.log('✅ Logged in');
    
    // Получаем список чатов
    console.log('\n2. Getting chats...');
    const chatsResponse = await fetch('http://localhost:8080/api/chats', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const chats = await chatsResponse.json();
    if (chats.length === 0) {
      console.log('❌ No chats found');
      return;
    }
    
    const chatId = chats[0].id;
    console.log(`✅ Found chat: ${chatId}`);
    
    // Получаем список пользователей для поиска реального ID
    console.log('\n3. Getting users...');
    const usersResponse = await fetch('http://localhost:8080/api/users/search?q=test', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const users = await usersResponse.json();
    const usersArray = users.users || []; // API возвращает { users: [...] }
    let targetUserId = null;
    
    if (usersArray.length > 0) {
      // Найдем пользователя, который не является текущим
      const currentUser = await fetch('http://localhost:8080/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const currentUserData = await currentUser.json();
      
      targetUserId = usersArray.find(u => u.id !== currentUserData.id)?.id;
    }
    
    if (!targetUserId) {
      console.log('❌ No other users found to add to chat');
      return;
    }
    
    console.log(`✅ Found user to add: ${targetUserId}`);
    
    // Пробуем добавить участников
    console.log('\n4. Testing add members...');
    const addMembersResponse = await fetch(`http://localhost:8080/api/chats/${chatId}/members`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userIds: [targetUserId]
      })
    });
    
    if (addMembersResponse.ok) {
      const result = await addMembersResponse.json();
      console.log('✅ Add members works:', result);
    } else {
      const error = await addMembersResponse.json();
      console.log('❌ Add members failed:', addMembersResponse.status, error);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testChatMembers();
