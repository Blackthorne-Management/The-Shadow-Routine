-- Security lint: pin search_path on category_point_max (flagged by the Supabase advisor)
alter function public.category_point_max(public.goal_category) set search_path = '';
