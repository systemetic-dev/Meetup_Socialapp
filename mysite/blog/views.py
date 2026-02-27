from django.shortcuts import render

# Create your views here.
from django.http import HttpResponse
from .models import Post

def hello(request):
    data = {
        "name": "John ",
        "age": 30,
        "is_logged_in": True,
        "fruits": ["Apple", "Banana", "Mango"]
    }
    return render(request,"blog/hello.html",data)

def post_list(request):
    posts = Post.objects.all()
    return render(request, 'blog/post_list.html', {"posts": posts})