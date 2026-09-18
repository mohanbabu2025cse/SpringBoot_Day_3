package com.example.SpringJPA.Reporistory;

import com.example.SpringJPA.Model.Food;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FoodReporistory extends JpaRepository<Food, Integer> {
}
