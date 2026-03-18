package co.stohill.erp.sales.controller;

import co.stohill.erp.sales.models.SaleTransaction;
import co.stohill.erp.sales.repository.SaleTransactionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/sales")
@RequiredArgsConstructor
public class SaleController {

    private final SaleTransactionRepository saleRepository;

    @GetMapping
    public List<SaleTransaction> getAllSales() {
        return saleRepository.findAll();
    }

    @SuppressWarnings("null")
    @GetMapping("/{id}")
    public ResponseEntity<SaleTransaction> getSaleById(@PathVariable UUID id) {
        return saleRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @SuppressWarnings("null")
    @PostMapping
    public SaleTransaction createSale(@RequestBody SaleTransaction sale) {
        return saleRepository.save(sale);
    }
}
