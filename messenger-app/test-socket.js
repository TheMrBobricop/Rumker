import { io } from 'socket.io-client';

async function testSocketMessages() {
  try {
    console.log('🚀 Testing socket messages...\n');
    
    // Логинимся
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
    
    // Получаем чаты
    const chatsResponse = await fetch('http://localhost:8080/api/chats', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const chats = await chatsResponse.json();
    if (chats.length === 0) {
      console.log('❌ No chats found');
      return;
    }
    
    const chatId = chats[0].id;
    console.log(`✅ Using chat: ${chatId}`);
    
    // Подключаемся к socket
    console.log('\n🔌 Connecting to socket...');
    const socket = io('http://localhost:8080', {
      auth: { token },
      transports: ['polling', 'websocket'],
      upgrade: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    
    socket.on('connect', () => {
      console.log('✅ Socket connected');
      
      // Отправляем сообщение через socket
      console.log('\n📝 Sending message via socket...');
      socket.emit('message:send', {
        chatId,
        content: 'Socket test message ' + new Date().toISOString(),
        type: 'text'
      });
    });
    
    socket.on('message:new', (message) => {
      console.log('✅ Received message via socket!');
      console.log('Message ID:', message.id);
      console.log('Content:', message.content);
      console.log('Sender:', message.sender?.username);
      console.log('Status:', message.status);
      console.log('Received message:', JSON.stringify(message, null, 2)); // Добавляю логирование для отладки получения сообщений на клиенте
      
      // Закрываем соединение после получения сообщения
      setTimeout(() => {
        socket.disconnect();
        console.log('\n✅ Test completed!');
      }, 1000);
    });
    
    socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
    });
    
    socket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error.message);
    });
    
    // Таймаут на случай, если сообщение не придет
    setTimeout(() => {
      console.log('⏰ Timeout - no message received');
      socket.disconnect();
    }, 5000);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testSocketMessages();
