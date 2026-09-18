package com.example.SpringJPA.Controller;

import com.example.SpringJPA.Model.Food;
import com.example.SpringJPA.Serive.FoodSerive;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import java.util.List;

@RestController
@RequestMapping("/api/order")
public class FoodController {
    private final FoodSerive foodSerive;

    public FoodController(FoodSerive foodSerive) {
        this.foodSerive = foodSerive;
    }

    @RequestMapping("/test")
    public String test() {
        return "Server is Running";
    }
    @PostMapping("/addFood")
    public ResponseEntity<Food> addFood(@RequestBody Food food) {
        return foodSerive.createFood(food);
    }
    @GetMapping("/foods")
    public List<Food> foods() { return foodSerive.listFoods(); }

    @PutMapping("/foods/{id}")
    public Food update(@PathVariable Integer id, @RequestBody Food food) {
        return foodSerive.updateFood(id, food);
    }

    @DeleteMapping("/foods/{id}")
    public ResponseEntity<Void> delete(@PathVariable Integer id) {
        foodSerive.deleteFood(id);
        return ResponseEntity.noContent().build();
    }
}
