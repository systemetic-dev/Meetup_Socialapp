from django.urls import path
from . import views
urlpatterns = [
    path('', views.hello, name = 'hello'),
    path('posts/', views.post_list, name='post_list'),
]