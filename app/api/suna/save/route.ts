import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/libs/supabase';

export async function POST(request: NextRequest) {
  try {
    // 获取请求体
    const body = await request.json();
    const { taskId, bookData } = body;

    if (!taskId || !bookData) {
      return NextResponse.json(
        { error: '请提供任务ID和绘本数据' },
        { status: 400 }
      );
    }

    // 获取认证头
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: '需要认证' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);

    // 验证JWT token
    try {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      
      if (error || !user) {
        return NextResponse.json(
          { error: '无效的认证令牌' },
          { status: 401 }
        );
      }

      // 调用Suna AI保存API
      const sunaResponse = await fetch(`${process.env.SUNA_API_BASE_URL}/api/suna/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          task_id: taskId,
          user_id: user.id,
          book_data: bookData,
        }),
      });

      if (!sunaResponse.ok) {
        const errorData = await sunaResponse.text();
        console.error('Suna AI save API error:', errorData);
        return NextResponse.json(
          { error: 'AI服务保存失败' },
          { status: 503 }
        );
      }

      const sunaData = await sunaResponse.json();
      
      return NextResponse.json({
        success: true,
        bookId: sunaData.book_id || sunaData.id,
        message: '绘本已成功保存到您的账户',
      });

    } catch (authError) {
      console.error('Auth error:', authError);
      return NextResponse.json(
        { error: '认证验证失败' },
        { status: 401 }
      );
    }

  } catch (error) {
    console.error('Save API error:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

