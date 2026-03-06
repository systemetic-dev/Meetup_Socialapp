from django.shortcuts import render
from models import post
# Create your views here.
def hello(request):
    data = {
        'name': 'Dev'
    }
    return render(request, 'blog/hello.html', data)

def posts(request):
    posts = post.objects.all()
    return render(request, 'blog/posts.html', {"posts": posts})